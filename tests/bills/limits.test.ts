import "./pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createBill, createDirectBill, createSummaryBill } from "@/lib/services/bills";
import { MAX_BILL_ROWS, generateBillSchema, generateSummaryBillSchema, updateBillSchema } from "@/lib/validation/bill";
import { cleanupTenant, createCompletedSession, createTenant, type TestTenant } from "../helpers/tenant";
import { billInput, directInput, failed, ok, summaryInput, uniq } from "./helpers";

/**
 * Two limits that bound what one request, or one business, can make the server do:
 *   - a bill carries at most MAX_BILL_ROWS rows (schema level, on all three ways to create or edit one);
 *   - a business whose plan sets `maxBillsPerDay` cannot create more than that per day, on every route that
 *     creates a bill, and the limit lifts as soon as support raises it. Only support can set it
 *     (tests/security/mass-assignment.test.ts proves an owner's request body cannot).
 */

const day = "2026-10-02";
const row = { excavatorId: "m1", siteName: "S", fromDate: day, toDate: day, hours: 1, ratePerHour: 1 };

describe("a bill has at most MAX_BILL_ROWS rows", () => {
  it("is 1000", () => {
    expect(MAX_BILL_ROWS).toBe(1000);
  });

  it("generate (from work records), summary and edit all accept exactly the cap and refuse one more", () => {
    const base = { customerId: "c1", billDate: day, billType: "NON_GST" as const };
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `ws-${i}`);
    const rows = (n: number) => Array.from({ length: n }, () => row);

    expect(generateBillSchema.safeParse({ ...base, workSessionIds: ids(1000), ratePerHour: 1 }).success).toBe(true);
    const tooManyIds = generateBillSchema.safeParse({ ...base, workSessionIds: ids(1001), ratePerHour: 1 });
    expect(tooManyIds.success).toBe(false);
    expect(tooManyIds.error?.issues[0].message).toMatch(/at most 1000 rows/);

    expect(generateSummaryBillSchema.safeParse({ ...base, items: rows(1000) }).success).toBe(true);
    expect(generateSummaryBillSchema.safeParse({ ...base, items: rows(1001) }).success).toBe(false);

    const edit = { ...base, billNumber: "N-1" };
    expect(updateBillSchema.safeParse({ ...edit, items: rows(1000) }).success).toBe(true);
    expect(updateBillSchema.safeParse({ ...edit, items: rows(1001) }).success).toBe(false);
  });
});

describe("maxBillsPerDay", () => {
  let t: TestTenant;
  beforeAll(async () => {
    t = await createTenant("bill-day-limit");
  });
  afterAll(async () => {
    await cleanupTenant(t.businessId);
    await db.$disconnect();
  });

  it("refuses the bill that would exceed the day's limit on summary AND direct routes, and lifts when raised", async () => {
    await db.business.update({ where: { id: t.businessId }, data: { maxBillsPerDay: 2 } });
    ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
    ok(await createDirectBill(t.businessId, t.actor, directInput(t)));

    const third = failed(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
    expect(third.error).toMatch(/limit of 2 bills per day/);
    const fourth = failed(await createDirectBill(t.businessId, t.actor, directInput(t)));
    expect(fourth.error).toMatch(/limit of 2 bills per day/);
    expect(await db.bill.count({ where: { businessId: t.businessId } })).toBe(2); // nothing was written by the refusals

    await db.business.update({ where: { id: t.businessId }, data: { maxBillsPerDay: 3 } });
    ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
    expect(await db.bill.count({ where: { businessId: t.businessId } })).toBe(3);
  });

  it("also applies to bills made from work records (the third bill-creating route)", async () => {
    const own = await createTenant("bill-day-limit-sessions");
    try {
      await db.business.update({ where: { id: own.businessId }, data: { maxBillsPerDay: 1 } });
      const [s1, s2] = [await createCompletedSession(own, { totalHours: 3 }), await createCompletedSession(own, { totalHours: 4 })];
      ok(await createBill(own.businessId, own.actor, billInput(own, [s1.id], { billNumber: `LIM-${uniq()}` })));
      const refused = failed(await createBill(own.businessId, own.actor, billInput(own, [s2.id], { billNumber: `LIM-${uniq()}` })));
      expect(refused.error).toMatch(/limit of 1 bills per day/);
      expect(await db.bill.count({ where: { businessId: own.businessId } })).toBe(1);
      expect(await db.billItem.count({ where: { workSessionId: s2.id } })).toBe(0); // the refused request billed nothing
    } finally {
      await cleanupTenant(own.businessId);
    }
  });

  it("holds under simultaneous requests: with a limit of 2, five at once create exactly two bills", async () => {
    const own = await createTenant("bill-day-limit-race");
    try {
      await db.business.update({ where: { id: own.businessId }, data: { maxBillsPerDay: 2 } });
      const results = await Promise.all(Array.from({ length: 5 }, () => createSummaryBill(own.businessId, own.actor, summaryInput(own))));
      expect(results.filter((r) => !("error" in r))).toHaveLength(2);
      expect(await db.bill.count({ where: { businessId: own.businessId } })).toBe(2);
    } finally {
      await cleanupTenant(own.businessId);
    }
  });

  it("no limit set (null) means unlimited", async () => {
    await db.business.update({ where: { id: t.businessId }, data: { maxBillsPerDay: null } });
    for (let i = 0; i < 4; i++) ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
  });
});
