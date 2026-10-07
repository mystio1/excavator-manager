import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import {
  approveJoinRequest,
  archiveOperator,
  createOperator,
  getOperatorDetail,
  listOperatorOptions,
  listOperatorsPage,
  setOperatorPin,
  updateOperator,
} from "@/lib/services/operators";
import { operatorSignupSchema, setOperatorPinSchema } from "@/lib/validation/operator";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { fileJoinRequest, uniqueMobile } from "./helpers";

/**
 * Admin-side operator management: audit rows, optimistic concurrency, PIN
 * rules, and tokenVersion bumps (which kill the operator's existing sessions).
 */

let t: TestTenant;
let other: TestTenant;
const tenants: string[] = [];

beforeAll(async () => {
  t = await createTenant("operator-admin");
  other = await createTenant("operator-admin-other");
  tenants.push(t.businessId, other.businessId);
});

afterAll(async () => {
  for (const id of tenants) await cleanupTenant(id);
  await db.$disconnect();
});

const audit = (businessId: string, action: string, entityId: string) =>
  db.auditLog.findMany({ where: { businessId, action, entityId }, orderBy: { createdAt: "asc" } });

const freshOperator = (data: { name?: string; mobile?: string; canLogin?: boolean; pinHash?: string | null } = {}) =>
  db.operator.create({
    data: { businessId: t.businessId, name: data.name ?? "Op", mobile: data.mobile ?? uniqueMobile(), ...data },
  });

describe("setOperatorPin", () => {
  it("set -> reset -> disable each bump tokenVersion and write an audit row (without any PIN hash)", async () => {
    const op = await freshOperator();

    const set = await setOperatorPin(t.businessId, t.actor, op.id, { canLogin: true, pin: "2468" });
    expect("error" in set).toBe(false);
    const afterSet = await db.operator.findUniqueOrThrow({ where: { id: op.id } });
    expect(afterSet.canLogin).toBe(true);
    expect(await verifyPassword("2468", afterSet.pinHash ?? "")).toBe(true);
    expect(afterSet.tokenVersion).toBe(op.tokenVersion + 1);
    expect(afterSet.version).toBe(op.version + 1);
    expect(await audit(t.businessId, "operator.pin.set", op.id)).toHaveLength(1);

    const reset = await setOperatorPin(t.businessId, t.actor, op.id, { canLogin: true, pin: "13579024" });
    expect("error" in reset).toBe(false);
    const afterReset = await db.operator.findUniqueOrThrow({ where: { id: op.id } });
    expect(await verifyPassword("13579024", afterReset.pinHash ?? "")).toBe(true);
    expect(await verifyPassword("2468", afterReset.pinHash ?? "")).toBe(false);
    expect(afterReset.tokenVersion).toBe(afterSet.tokenVersion + 1);
    expect(await audit(t.businessId, "operator.pin.reset", op.id)).toHaveLength(1);

    const disable = await setOperatorPin(t.businessId, t.actor, op.id, { canLogin: false });
    expect("error" in disable).toBe(false);
    const afterDisable = await db.operator.findUniqueOrThrow({ where: { id: op.id } });
    expect(afterDisable.canLogin).toBe(false);
    expect(afterDisable.pinHash).toBeNull();
    expect(afterDisable.tokenVersion).toBe(afterReset.tokenVersion + 1);
    expect(await audit(t.businessId, "operator.login.disable", op.id)).toHaveLength(1);

    const rows = await db.auditLog.findMany({ where: { businessId: t.businessId, entityId: op.id } });
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(afterSet.pinHash ?? "no-hash");
    expect(dump).not.toContain(afterReset.pinHash ?? "no-hash");
    expect(dump).not.toMatch(/pinHash/i);
    expect(rows.every((r) => r.actorType === "OWNER" && r.actorId === t.actor.id)).toBe(true);
  });

  it("enabling login without a PIN does not touch tokenVersion; repeating it is a no-op", async () => {
    const op = await freshOperator();

    expect("error" in (await setOperatorPin(t.businessId, t.actor, op.id, { canLogin: true }))).toBe(false);
    const enabled = await db.operator.findUniqueOrThrow({ where: { id: op.id } });
    expect(enabled.canLogin).toBe(true);
    expect(enabled.pinHash).toBeNull();
    expect(enabled.tokenVersion).toBe(op.tokenVersion);
    expect(await audit(t.businessId, "operator.login.enable", op.id)).toHaveLength(1);

    const again = await setOperatorPin(t.businessId, t.actor, op.id, { canLogin: true });
    expect(again).toMatchObject({ ok: true, version: enabled.version });
    expect(await audit(t.businessId, "operator.login.enable", op.id)).toHaveLength(1);
  });

  it.each(["123", "123456789", "12a456", "12 456", "٣٤٥٦", "-1234", "12.34"])("rejects the invalid new PIN %j and changes nothing", async (pin) => {
    const op = await freshOperator();

    const result = await setOperatorPin(t.businessId, t.actor, op.id, { canLogin: true, pin });

    expect(result).toMatchObject({ code: "VALIDATION_FAILED", error: "PIN must be 4-8 digits" });
    expect(await db.operator.findUniqueOrThrow({ where: { id: op.id } })).toEqual(op);
    expect(await db.auditLog.count({ where: { businessId: t.businessId, entityId: op.id } })).toBe(0);
  });

  it("the request schema enforces the same PIN rule (and a disable request needs no PIN)", () => {
    expect(setOperatorPinSchema.safeParse({ canLogin: true, pin: "1234" }).success).toBe(true);
    expect(setOperatorPinSchema.safeParse({ canLogin: true, pin: "12345678" }).success).toBe(true);
    expect(setOperatorPinSchema.safeParse({ canLogin: true, pin: "123" }).success).toBe(false);
    expect(setOperatorPinSchema.safeParse({ canLogin: true, pin: "123456789" }).success).toBe(false);
    expect(setOperatorPinSchema.safeParse({ canLogin: true, pin: "abcd" }).success).toBe(false);
    expect(setOperatorPinSchema.safeParse({ canLogin: true }).success).toBe(true);
    expect(setOperatorPinSchema.safeParse({ canLogin: false }).success).toBe(true);
    expect(setOperatorPinSchema.safeParse({ canLogin: true, pin: "1234", expectedVersion: -1 }).success).toBe(false);
  });

  it("the signup schema enforces 4-8 digits and matching confirmation", () => {
    const base = { businessCode: "ABC", name: "N", mobile: "9876543210", pin: "1234", confirmPin: "1234" };
    expect(operatorSignupSchema.safeParse(base).success).toBe(true);
    expect(operatorSignupSchema.safeParse({ ...base, pin: "123", confirmPin: "123" }).success).toBe(false);
    expect(operatorSignupSchema.safeParse({ ...base, pin: "abcd", confirmPin: "abcd" }).success).toBe(false);
    expect(operatorSignupSchema.safeParse({ ...base, pin: "123456789", confirmPin: "123456789" }).success).toBe(false);
    expect(operatorSignupSchema.safeParse({ ...base, confirmPin: "4321" }).success).toBe(false);
  });

  it("honours expectedVersion: stale -> RESOURCE_MODIFIED (nothing changes), current -> ok and version+1", async () => {
    const op = await freshOperator();

    const stale = await setOperatorPin(t.businessId, t.actor, op.id, { canLogin: true, pin: "1111", expectedVersion: op.version + 5 });
    expect(stale).toMatchObject({ code: "RESOURCE_MODIFIED" });
    expect(await db.operator.findUniqueOrThrow({ where: { id: op.id } })).toEqual(op);

    const ok = await setOperatorPin(t.businessId, t.actor, op.id, { canLogin: true, pin: "1111", expectedVersion: op.version });
    expect(ok).toMatchObject({ ok: true, version: op.version + 1 });
  });

  it("is tenant-scoped, and cannot enable login for an archived operator", async () => {
    const op = await freshOperator();
    expect(await setOperatorPin(other.businessId, other.actor, op.id, { canLogin: true, pin: "9999" })).toMatchObject({ code: "NOT_FOUND" });
    expect(await db.operator.findUniqueOrThrow({ where: { id: op.id } })).toEqual(op);

    const archived = await db.operator.create({
      data: { businessId: t.businessId, name: "Gone", mobile: uniqueMobile(), isArchived: true },
    });
    expect(await setOperatorPin(t.businessId, t.actor, archived.id, { canLogin: true, pin: "9999" })).toMatchObject({ code: "NOT_FOUND" });
  });

  it("a join-request approval and an admin PIN reset serialize on the operator row", async () => {
    const op = await freshOperator();
    const { requestId, code } = await fileJoinRequest(t, { mobile: op.mobile, pin: "4444" });

    await Promise.all([
      approveJoinRequest(t.businessId, t.actor, requestId, code),
      setOperatorPin(t.businessId, t.actor, op.id, { canLogin: true, pin: "5555" }),
    ]);

    // Whatever the order, the result is consistent: login enabled, exactly one PIN in force.
    const after = await db.operator.findUniqueOrThrow({ where: { id: op.id } });
    expect(after.canLogin).toBe(true);
    const matches = [await verifyPassword("4444", after.pinHash ?? ""), await verifyPassword("5555", after.pinHash ?? "")];
    expect(matches.filter(Boolean)).toHaveLength(1);
    expect(after.tokenVersion).toBeGreaterThan(op.tokenVersion);
  });
});

describe("updateOperator", () => {
  it("updates, increments version, stores salary rounded to 2dp, and audits before/after", async () => {
    const created = await createOperator(t.businessId, t.actor, { name: "Before", mobile: uniqueMobile(), defaultMonthlySalary: 15000 });
    if ("error" in created) throw new Error(created.error);
    const id = created.operator.id;

    const result = await updateOperator(t.businessId, t.actor, id, {
      name: "After",
      mobile: created.operator.mobile,
      address: "Pune",
      defaultMonthlySalary: 20000.555,
      expectedVersion: created.operator.version,
    });

    expect(result).toMatchObject({ ok: true, version: created.operator.version + 1 });
    const row = await db.operator.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ name: "After", address: "Pune" });
    expect(row.defaultMonthlySalary.toString()).toBe("20000.56");

    const [entry] = await audit(t.businessId, "operator.update", id);
    expect(entry).toBeDefined();
    expect(entry.entityType).toBe("Operator");
    expect(entry.before).toMatchObject({ name: "Before", defaultMonthlySalary: "15000" });
    expect(entry.after).toMatchObject({ name: "After", defaultMonthlySalary: "20000.56" });
  });

  it("refuses a stale expectedVersion with RESOURCE_MODIFIED and leaves the row alone", async () => {
    const op = await freshOperator({ name: "Original" });
    const first = await updateOperator(t.businessId, t.actor, op.id, { name: "Edited Elsewhere", mobile: op.mobile, expectedVersion: op.version });
    expect("error" in first).toBe(false);

    const stale = await updateOperator(t.businessId, t.actor, op.id, { name: "Lost Update", mobile: op.mobile, expectedVersion: op.version });

    expect(stale).toMatchObject({ code: "RESOURCE_MODIFIED" });
    expect((await db.operator.findUniqueOrThrow({ where: { id: op.id } })).name).toBe("Edited Elsewhere");
  });

  it("without expectedVersion (older apps) the check is skipped", async () => {
    const op = await freshOperator();
    expect("error" in (await updateOperator(t.businessId, t.actor, op.id, { name: "Old App Edit", mobile: op.mobile }))).toBe(false);
    expect((await db.operator.findUniqueOrThrow({ where: { id: op.id } })).name).toBe("Old App Edit");
  });

  it("is tenant-scoped: NOT_FOUND for another business's operator", async () => {
    const op = await freshOperator({ name: "Mine" });
    const result = await updateOperator(other.businessId, other.actor, op.id, { name: "Hijacked", mobile: op.mobile });
    expect(result).toMatchObject({ code: "NOT_FOUND" });
    expect((await db.operator.findUniqueOrThrow({ where: { id: op.id } })).name).toBe("Mine");
  });

  it("never changes credentials", async () => {
    const op = await freshOperator({ canLogin: true, pinHash: "$2b$10$keep.this.hash.exactly" });
    await updateOperator(t.businessId, t.actor, op.id, { name: "Renamed", mobile: op.mobile });
    const after = await db.operator.findUniqueOrThrow({ where: { id: op.id } });
    expect(after.pinHash).toBe(op.pinHash);
    expect(after.canLogin).toBe(true);
    expect(after.tokenVersion).toBe(op.tokenVersion);
  });
});

describe("archiveOperator", () => {
  it("archives, bumps tokenVersion (kills sessions), and audits; a repeat is harmless", async () => {
    const op = await freshOperator({ canLogin: true, pinHash: "$2b$10$some.hash" });

    const result = await archiveOperator(t.businessId, t.actor, op.id, op.version);
    expect(result).toMatchObject({ ok: true, version: op.version + 1 });
    const after = await db.operator.findUniqueOrThrow({ where: { id: op.id } });
    expect(after.isArchived).toBe(true);
    expect(after.tokenVersion).toBe(op.tokenVersion + 1);
    expect(await audit(t.businessId, "operator.archive", op.id)).toHaveLength(1);

    expect("error" in (await archiveOperator(t.businessId, t.actor, op.id))).toBe(false);
    expect(await audit(t.businessId, "operator.archive", op.id)).toHaveLength(1);
    expect((await db.operator.findUniqueOrThrow({ where: { id: op.id } })).tokenVersion).toBe(after.tokenVersion);
  });

  it("refuses a stale expectedVersion and is tenant-scoped", async () => {
    const op = await freshOperator();
    expect(await archiveOperator(t.businessId, t.actor, op.id, op.version + 1)).toMatchObject({ code: "RESOURCE_MODIFIED" });
    expect(await archiveOperator(other.businessId, other.actor, op.id)).toMatchObject({ code: "NOT_FOUND" });
    expect((await db.operator.findUniqueOrThrow({ where: { id: op.id } })).isArchived).toBe(false);
  });

  it("an archived operator drops out of the list and the options", async () => {
    const op = await freshOperator({ name: "Soon Gone" });
    await archiveOperator(t.businessId, t.actor, op.id);
    const { operators } = await listOperatorsPage(t.businessId, { limit: 200, cursor: undefined });
    expect(operators.some((o) => o.id === op.id)).toBe(false);
    expect((await listOperatorOptions(t.businessId)).some((o) => o.id === op.id)).toBe(false);
  });
});

describe("createOperator", () => {
  it("audits the creation and never returns a PIN hash", async () => {
    const result = await createOperator(t.businessId, t.actor, { name: "Created", mobile: uniqueMobile() });
    if ("error" in result) throw new Error(result.error);
    expect("pinHash" in result.operator).toBe(false);
    const [entry] = await audit(t.businessId, "operator.create", result.operator.id);
    expect(entry).toBeDefined();
    expect(entry.after).toMatchObject({ name: "Created" });
  });

  it("enforces maxOperators with CONFLICT", async () => {
    const capped = await createTenant("operator-admin-cap");
    tenants.push(capped.businessId);
    await db.business.update({ where: { id: capped.businessId }, data: { maxOperators: 1 } });
    const result = await createOperator(capped.businessId, capped.actor, { name: "Over", mobile: uniqueMobile() });
    expect(result).toMatchObject({ code: "CONFLICT" });
  });
});

describe("reads", () => {
  it("getOperatorDetail never ships the hash but still says whether a PIN exists", async () => {
    const withPin = await freshOperator({ canLogin: true, pinHash: "$2b$10$should.never.leave.the.server" });
    const without = await freshOperator();

    const a = await getOperatorDetail(t.businessId, withPin.id);
    const b = await getOperatorDetail(t.businessId, without.id);

    expect(a?.operator).toMatchObject({ pinHash: "set", hasPin: true });
    expect(b?.operator).toMatchObject({ pinHash: null, hasPin: false });
    expect(JSON.stringify(a)).not.toContain("should.never.leave");
    expect(await getOperatorDetail(other.businessId, withPin.id)).toBeNull();
  });

  it("listOperatorsPage pages with a cursor and flags operators with a pending join request", async () => {
    const pageTenant = await createTenant("operator-admin-page"); // already has 1 operator
    tenants.push(pageTenant.businessId);
    const extra = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        db.operator.create({
          data: { businessId: pageTenant.businessId, name: `P${i}`, mobile: uniqueMobile(), createdAt: new Date(Date.UTC(2026, 0, i)) },
        }),
      ),
    );
    await fileJoinRequest(pageTenant, { mobile: extra[0].mobile });

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    let flagged: string[] = [];
    do {
      const page = await listOperatorsPage(pageTenant.businessId, { limit: 2, cursor });
      expect(page.operators.length).toBeLessThanOrEqual(2);
      seen.push(...page.operators.map((o) => o.id));
      flagged = [...flagged, ...page.operators.filter((o) => o.joinPending).map((o) => o.id)];
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);

    expect(pages).toBe(3); // 5 operators, 2 per page
    expect(new Set(seen).size).toBe(5); // no duplicates, none missing
    expect(flagged).toEqual([extra[0].id]);
  });
});
