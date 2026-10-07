import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createServiceRecord,
  getComponentHistory,
  listServiceHistory,
} from "@/lib/services/serviceRecords";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { auditRows, failed, newMachine, ok, snapshot } from "./helpers";

/**
 * Service records carry money (ServiceRecord.cost / ServiceRecordItem.cost are
 * NUMERIC): sums must be exact, the record is audited, and a record may only
 * ever reference this business's machine and catalog items.
 */

let t: TestTenant;
let other: TestTenant;
let oil: { id: string };
let filter: { id: string };
let belt: { id: string };
let foreignItem: { id: string };

beforeAll(async () => {
  t = await createTenant("fleet-service");
  other = await createTenant("fleet-service-other");
  [oil, filter, belt, foreignItem] = await Promise.all([
    db.serviceItem.create({ data: { businessId: t.businessId, name: "Engine Oil", category: "Engine", defaultIntervalHours: 500 } }),
    db.serviceItem.create({ data: { businessId: t.businessId, name: "Air Filter", category: "Engine", defaultIntervalHours: 250 } }),
    db.serviceItem.create({ data: { businessId: t.businessId, name: "Fan Belt", category: "Engine" } }),
    db.serviceItem.create({ data: { businessId: other.businessId, name: "Foreign Part", category: "Other" } }),
  ]);
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await cleanupTenant(other.businessId);
});

const record = (over: Record<string, unknown> = {}) => ({
  serviceDate: "2026-10-01",
  hourMeterAtService: 1000,
  items: [{ serviceItemId: oil.id, action: "Serviced" as const, cost: 100 }],
  ...over,
});

describe("createServiceRecord - money", () => {
  it("sums line costs EXACTLY (0.1 + 0.2 is 0.3, not 0.30000000000000004)", async () => {
    const m = await newMachine(t);
    const { record: created } = ok(
      await createServiceRecord(t.businessId, t.actor, {
        excavatorId: m.id,
        ...record({
          items: [
            { serviceItemId: oil.id, action: "Serviced", cost: 0.1 },
            { serviceItemId: filter.id, action: "Replaced", cost: 0.2 },
          ],
        }),
      }),
    );
    expect(created.cost.toString()).toBe("0.3");
    const stored = await db.serviceRecord.findUniqueOrThrow({ where: { id: created.id }, include: { items: true } });
    expect(stored.cost.toString()).toBe("0.3");
    expect(stored.items.map((i) => i.cost.toString()).sort()).toEqual(["0.1", "0.2"]);
  });

  it("rounds each line to the paisa (half up) and the total is the exact sum of the STORED lines", async () => {
    const m = await newMachine(t);
    const { record: created } = ok(
      await createServiceRecord(t.businessId, t.actor, {
        excavatorId: m.id,
        ...record({
          items: [
            { serviceItemId: oil.id, action: "Serviced", cost: 1234.565 },
            { serviceItemId: filter.id, action: "Replaced", cost: 10.005 },
            { serviceItemId: belt.id, action: "Changed", cost: 0.004 },
          ],
        }),
      }),
    );
    // 1234.57 + 10.01 + 0.00 (NOT 1244.574 -> 1244.57)
    expect(created.cost.toString()).toBe("1244.58");
    expect(created.items.map((i) => i.cost.toString()).sort()).toEqual(["0", "10.01", "1234.57"]);
  });

  it("many small lines add up exactly (ten lines of 0.1 = 1)", async () => {
    const m = await newMachine(t);
    const { record: created } = ok(
      await createServiceRecord(t.businessId, t.actor, {
        excavatorId: m.id,
        ...record({ items: Array.from({ length: 10 }, () => ({ serviceItemId: oil.id, action: "Serviced", cost: 0.1 })) }),
      }),
    );
    expect(created.cost.toString()).toBe("1");
    const history = await listServiceHistory(t.businessId, m.id);
    expect(history[0].cost.toString()).toBe("1");
    expect(history[0].items).toHaveLength(10);
  });

  it("a record without costs is zero, and costs survive the JSON round trip as plain numbers", async () => {
    const m = await newMachine(t);
    const { record: created } = ok(
      await createServiceRecord(t.businessId, t.actor, {
        excavatorId: m.id,
        ...record({ items: [{ serviceItemId: belt.id, action: "Inspected" }, { serviceItemId: oil.id, action: "Serviced", cost: 99.99 }] }),
      }),
    );
    const wire = JSON.parse(JSON.stringify(created)) as { cost: unknown; items: { cost: unknown }[] };
    expect(wire.cost).toBe(99.99);
    expect(wire.items.every((i) => typeof i.cost === "number")).toBe(true);
  });
});

describe("createServiceRecord - effects and audit", () => {
  it("derives the next due hour from actioned components, moves the meter forward (version), and audits with the cost", async () => {
    const m = await newMachine(t, { currentHourMeter: 900 });
    const { record: created } = ok(
      await createServiceRecord(t.businessId, t.actor, {
        excavatorId: m.id,
        ...record({
          hourMeterAtService: 1000.005,
          notes: "  big service  ",
          items: [
            { serviceItemId: oil.id, action: "Serviced", cost: 2500.5 },
            { serviceItemId: filter.id, action: "Replaced", cost: 800 },
            // Not actioned: must not pull the due hour forward.
            { serviceItemId: belt.id, action: "Not Done" },
          ],
        }),
      }),
    );
    expect(created.hourMeterAtService).toBe(1000.01);
    expect(created.nextServiceDueHour).toBe(1250.01); // 1000.01 + 250 (soonest interval among actioned parts)
    expect(created.items.find((i) => i.serviceItemId === belt.id)).toMatchObject({ done: false, action: "Not Done" });

    const mach = await db.excavator.findUniqueOrThrow({ where: { id: m.id } });
    expect(mach).toMatchObject({ currentHourMeter: 1000.01, version: m.version + 1 });

    const rows = await auditRows(t.businessId, "ServiceRecord", created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "serviceRecord.create", actorType: "OWNER", actorId: t.userId });
    expect(snapshot(rows[0].after)).toMatchObject({ cost: "3300.5", businessId: t.businessId, excavatorId: m.id });
    const details = rows[0].details as { totalCost: string; excavatorMeter: { from: number; to: number } };
    expect(details.totalCost).toBe("3300.50");
    expect(details.excavatorMeter).toEqual({ from: 900, to: 1000.01 });
  });

  it("a service at a LOWER reading never rewinds the machine's meter or bumps its version", async () => {
    const m = await newMachine(t, { currentHourMeter: 1500 });
    ok(await createServiceRecord(t.businessId, t.actor, { excavatorId: m.id, ...record({ hourMeterAtService: 1200 }) }));
    expect(await db.excavator.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ currentHourMeter: 1500, version: 0 });
  });
});

describe("createServiceRecord - tenant scoping", () => {
  it("refuses another business's machine, and another business's catalog item - writing nothing", async () => {
    const m = await newMachine(t);
    const foreignMachine = await newMachine(other, { name: "Foreign" });
    const recordsBefore = await db.serviceRecord.count({ where: { businessId: { in: [t.businessId, other.businessId] } } });

    const onForeignMachine = failed(await createServiceRecord(t.businessId, t.actor, { excavatorId: foreignMachine.id, ...record() }));
    expect(onForeignMachine.code).toBe("NOT_FOUND");

    const withForeignItem = failed(
      await createServiceRecord(t.businessId, t.actor, {
        excavatorId: m.id,
        ...record({ items: [{ serviceItemId: oil.id, action: "Serviced", cost: 5 }, { serviceItemId: foreignItem.id, action: "Serviced", cost: 5 }] }),
      }),
    );
    expect(withForeignItem.code).toBe("NOT_FOUND");

    expect(await db.serviceRecord.count({ where: { businessId: { in: [t.businessId, other.businessId] } } })).toBe(recordsBefore);
    expect((await db.excavator.findUniqueOrThrow({ where: { id: foreignMachine.id } })).version).toBe(0);
    expect(await db.auditLog.count({ where: { businessId: other.businessId, action: "serviceRecord.create" } })).toBe(0);
  });

  it("history reads never leak another business's records", async () => {
    const foreignMachine = await newMachine(other, { name: "Foreign history" });
    const foreignOil = await db.serviceItem.create({ data: { businessId: other.businessId, name: "Oil", category: "Engine" } });
    ok(
      await createServiceRecord(other.businessId, other.actor, {
        excavatorId: foreignMachine.id,
        ...record({ items: [{ serviceItemId: foreignOil.id, action: "Serviced", cost: 10 }] }),
      }),
    );

    expect(await listServiceHistory(t.businessId, foreignMachine.id)).toEqual([]);
    expect(await getComponentHistory(t.businessId, foreignMachine.id, foreignOil.id)).toEqual([]);
    expect(await listServiceHistory(other.businessId, foreignMachine.id)).toHaveLength(1);
  });
});
