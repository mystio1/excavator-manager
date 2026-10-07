import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { listWorkHistory } from "@/lib/services/workSessions";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { newMachine } from "./helpers";

/** Work history: stable cursor pagination (limit/cursor + nextCursor), filters, backward-compatible default page. */

let t: TestTenant;
let machineId: string;
let otherCustomerId: string;
/** Session ids in the exact order the API must return them (newest start first, id as tie-breaker). */
let expectedOrder: string[];

beforeAll(async () => {
  t = await createTenant("fleet-history");
  const machine = await newMachine(t);
  machineId = machine.id;
  const otherCustomer = await db.customer.create({ data: { businessId: t.businessId, name: "Second Customer", mobile: "9444444444" } });
  otherCustomerId = otherCustomer.id;

  // Seven completed jobs; three of them share a start date, so the id
  // tie-breaker is what keeps the paging stable.
  const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-03", "2026-09-03", "2026-09-04", "2026-09-05"];
  const created = [];
  for (const [i, date] of dates.entries()) {
    created.push(
      await db.workSession.create({
        data: {
          businessId: t.businessId,
          excavatorId: machineId,
          customerId: i % 2 === 0 ? t.customerId : otherCustomerId,
          siteId: t.siteId,
          operatorId: t.operatorId,
          startDate: new Date(date),
          endDate: new Date(date),
          startHourMeter: 100 + i * 10,
          endHourMeter: 108 + i * 10,
          totalHours: 8,
          status: "COMPLETED",
        },
      }),
    );
  }
  expectedOrder = created
    .sort((x, y) => y.startDate.getTime() - x.startDate.getTime() || (x.id < y.id ? 1 : -1))
    .map((s) => s.id);
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
});

async function walk(limit: number, filters = {}) {
  const pages: string[][] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 20; guard++) {
    const { history, nextCursor } = await listWorkHistory(t.businessId, machineId, filters, { limit, cursor });
    pages.push(history.map((s) => s.id));
    if (!nextCursor) return pages;
    cursor = nextCursor;
  }
  throw new Error("pagination did not terminate");
}

describe("listWorkHistory pagination", () => {
  it("pages through every job exactly once, in a stable order, ending with a null cursor", async () => {
    const pages = await walk(3);
    expect(pages.map((p) => p.length)).toEqual([3, 3, 1]);
    expect(pages.flat()).toEqual(expectedOrder);
    expect(new Set(pages.flat()).size).toBe(7);
  });

  it("a page that exactly fills the limit has no phantom next page", async () => {
    const pages = await walk(7);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual(expectedOrder);
    const single = await listWorkHistory(t.businessId, machineId, {}, { limit: 7, cursor: undefined });
    expect(single.nextCursor).toBeNull();
  });

  it("older callers (no explicit page) still get the whole history under the same `history` key", async () => {
    const legacy = await listWorkHistory(t.businessId, machineId);
    expect(legacy.history.map((s) => s.id)).toEqual(expectedOrder);
    expect(legacy.nextCursor).toBeNull();
    // Each row still carries what the History tab renders.
    expect(legacy.history[0]).toMatchObject({ status: "COMPLETED" });
    expect(legacy.history[0].customer.name).toBeTruthy();
    expect(legacy.history[0].site.name).toBe("Test Site");
    expect(legacy.history[0].operator).not.toHaveProperty("pinHash");
  });

  it("keeps the filters across pages", async () => {
    const mine = expectedOrder.length;
    const byCustomer = await walk(2, { customerId: otherCustomerId });
    const ids = byCustomer.flat();
    expect(ids.length).toBeLessThan(mine);
    const rows = await db.workSession.findMany({ where: { id: { in: ids } }, select: { customerId: true } });
    expect(rows.every((r) => r.customerId === otherCustomerId)).toBe(true);
    expect(ids).toEqual(expectedOrder.filter((id) => ids.includes(id)));

    const ranged = await walk(2, { from: "2026-09-03", to: "2026-09-04" });
    expect(ranged.flat()).toHaveLength(4); // the three on 09-03 and the one on 09-04
  });

  it("rejects an unparseable date filter instead of failing inside the query", async () => {
    await expect(listWorkHistory(t.businessId, machineId, { from: "not-a-date" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});
