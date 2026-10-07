import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  archiveExcavator,
  createExcavator,
  getExcavatorDetail,
  listExcavators,
  reorderExcavators,
  setExcavatorSite,
  updateExcavator,
} from "@/lib/services/excavators";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { auditRows, failed, newMachine, ok, snapshot } from "./helpers";

/** Machine CRUD, archive, default site and ordering: versions, audit trail, tenant scoping. */

let t: TestTenant;
let other: TestTenant;

beforeAll(async () => {
  t = await createTenant("fleet-machines");
  other = await createTenant("fleet-machines-other");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await cleanupTenant(other.businessId);
});

const machine = (id: string) => db.excavator.findUniqueOrThrow({ where: { id } });

const editBody = (over: Record<string, unknown> = {}) => ({ name: "Renamed JCB", machineNumber: "MH-12", ...over });

describe("createExcavator", () => {
  it("creates the machine at the end of the order with its meter, and audits it", async () => {
    const created = await createExcavator(t.businessId, t.actor, {
      name: "New CAT",
      machineNumber: "MH-01",
      startingHourMeter: 250.555,
      serviceIntervalHrs: 400,
    });
    expect(created).toMatchObject({ name: "New CAT", startingHourMeter: 250.56, currentHourMeter: 250.56, version: 0 });

    const rows = await auditRows(t.businessId, "Excavator", created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "excavator.create", actorType: "OWNER", actorId: t.userId });
    expect(snapshot(rows[0].after)).toMatchObject({ name: "New CAT", businessId: t.businessId });
  });
});

describe("updateExcavator", () => {
  it("moves the version, audits before/after, and refuses a stale version", async () => {
    const m = await newMachine(t, { name: "Edit Me" });

    const first = ok(await updateExcavator(t.businessId, t.actor, m.id, editBody({ expectedVersion: 0 })));
    expect(first.version).toBe(1);
    expect(await machine(m.id)).toMatchObject({ name: "Renamed JCB", machineNumber: "MH-12", version: 1 });

    const stale = failed(
      await updateExcavator(t.businessId, t.actor, m.id, editBody({ name: "Lost update", expectedVersion: 0 })),
    );
    expect(stale.code).toBe("RESOURCE_MODIFIED");
    expect(stale.error).toMatch(/changed by someone else/i);
    expect((await machine(m.id)).name).toBe("Renamed JCB");

    // Older apps send no expectedVersion: still allowed.
    const legacy = ok(await updateExcavator(t.businessId, t.actor, m.id, editBody({ name: "Legacy edit" })));
    expect(legacy.version).toBe(2);

    const rows = await auditRows(t.businessId, "Excavator", m.id);
    expect(rows.map((r) => r.action)).toEqual(["excavator.update", "excavator.update"]);
    expect(snapshot(rows[0].before)).toMatchObject({ name: "Edit Me", version: 0 });
    expect(snapshot(rows[0].after)).toMatchObject({ name: "Renamed JCB", version: 1 });
  });

  it("never changes the starting meter or the live meter", async () => {
    const m = await newMachine(t, { currentHourMeter: 321 });
    ok(await updateExcavator(t.businessId, t.actor, m.id, editBody({ startingHourMeter: 999 })));
    expect(await machine(m.id)).toMatchObject({ startingHourMeter: 100, currentHourMeter: 321 });
  });
});

describe("archiveExcavator", () => {
  it("archives (never deletes), audits, and drops the machine from the active list", async () => {
    const m = await newMachine(t, { name: "Archive Me" });
    expect((await listExcavators(t.businessId)).some((e) => e.id === m.id)).toBe(true);

    const stale = failed(await archiveExcavator(t.businessId, t.actor, m.id, { expectedVersion: 4 }));
    expect(stale.code).toBe("RESOURCE_MODIFIED");
    expect((await machine(m.id)).isArchived).toBe(false);

    const result = ok(await archiveExcavator(t.businessId, t.actor, m.id, { expectedVersion: 0 }));
    expect(result.version).toBe(1);
    expect(await machine(m.id)).toMatchObject({ isArchived: true, version: 1 });
    expect((await listExcavators(t.businessId)).some((e) => e.id === m.id)).toBe(false);

    // Archiving twice is a no-op: no extra version, no extra audit row.
    ok(await archiveExcavator(t.businessId, t.actor, m.id));
    expect((await machine(m.id)).version).toBe(1);
    const rows = await auditRows(t.businessId, "Excavator", m.id);
    expect(rows.map((r) => r.action)).toEqual(["excavator.archive"]);
    expect(snapshot(rows[0].before)).toMatchObject({ isArchived: false, version: 0 });
    expect(snapshot(rows[0].after)).toMatchObject({ isArchived: true, version: 1 });
  });
});

describe("setExcavatorSite", () => {
  it("sets the default site (a write: version + audit) and is a no-op for the same site", async () => {
    const m = await newMachine(t);
    const first = ok(await setExcavatorSite(t.businessId, t.actor, m.id, "  test site  "));
    expect(first.site.id).toBe(t.siteId); // matched the existing "Test Site", ignoring case/spaces
    expect(await machine(m.id)).toMatchObject({ currentSiteId: t.siteId, version: 1 });

    ok(await setExcavatorSite(t.businessId, t.actor, m.id, "Test Site"));
    expect((await machine(m.id)).version).toBe(1);

    ok(await setExcavatorSite(t.businessId, t.actor, m.id, "Brand New Site"));
    expect((await machine(m.id)).version).toBe(2);
    const rows = await auditRows(t.businessId, "Excavator", m.id);
    expect(rows.map((r) => r.action)).toEqual(["excavator.update", "excavator.update"]);
    expect((rows[1].details as { siteName: string }).siteName).toBe("Brand New Site");
  });
});

describe("reorderExcavators", () => {
  it("reorders only this business's machines; another tenant's ids are ignored and untouched", async () => {
    const a = await newMachine(t, { name: "A" });
    const b = await newMachine(t, { name: "B" });
    const c = await newMachine(t, { name: "C" });
    const foreign = await newMachine(other, { name: "Foreign" });
    await db.excavator.updateMany({ where: { id: { in: [a.id, b.id, c.id] } }, data: { sortOrder: 0 } });
    const foreignBefore = await machine(foreign.id);

    const result = await reorderExcavators(t.businessId, [c.id, foreign.id, a.id, b.id, "no-such-id", c.id]);
    expect(result).toEqual({ count: 3, ignored: 2 });

    // c, a, b -> positions 1, 2, 3 (the foreign id does not take a slot).
    const rows = await db.excavator.findMany({ where: { id: { in: [a.id, b.id, c.id] } }, select: { id: true, sortOrder: true, version: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(c.id)?.sortOrder).toBe(1);
    expect(byId.get(a.id)?.sortOrder).toBe(2);
    expect(byId.get(b.id)?.sortOrder).toBe(3);
    // Every machine whose position changed counts as a write.
    expect([...byId.values()].every((r) => r.version === 1)).toBe(true);

    // The other tenant's machine was never read or written.
    expect(await machine(foreign.id)).toEqual(foreignBefore);

    // Re-saving the same order changes nothing (no version churn).
    await reorderExcavators(t.businessId, [c.id, a.id, b.id]);
    expect((await machine(c.id)).version).toBe(1);

    // The list follows the stored order.
    const listed = (await listExcavators(t.businessId)).filter((e) => [a.id, b.id, c.id].includes(e.id)).map((e) => e.name);
    expect(listed).toEqual(["C", "A", "B"]);
  });
});

describe("tenant scoping of machine reads/writes", () => {
  it("another business's machine is invisible and immutable", async () => {
    const foreign = await newMachine(other, { name: "Foreign 2" });
    const before = await machine(foreign.id);

    expect(await getExcavatorDetail(t.businessId, foreign.id)).toBeNull();
    expect((await listExcavators(t.businessId)).some((e) => e.id === foreign.id)).toBe(false);
    expect(failed(await updateExcavator(t.businessId, t.actor, foreign.id, editBody())).code).toBe("NOT_FOUND");
    expect(failed(await archiveExcavator(t.businessId, t.actor, foreign.id)).code).toBe("NOT_FOUND");
    expect(failed(await setExcavatorSite(t.businessId, t.actor, foreign.id, "Hijack")).code).toBe("NOT_FOUND");

    expect(await machine(foreign.id)).toEqual(before);
    expect(await auditRows(other.businessId, "Excavator", foreign.id)).toHaveLength(0);
    expect(await auditRows(t.businessId, "Excavator", foreign.id)).toHaveLength(0);
  });
});
