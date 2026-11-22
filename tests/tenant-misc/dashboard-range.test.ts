import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  dashboardRangeFromDays,
  getDashboardSummary,
  getMachineHoursDetail,
  getPaymentCollectionStatus,
  getProfitOverview,
  getTopCustomersByRevenue,
  rangeDays,
  salaryCostForRange,
} from "@/lib/services/dashboard";
import { dashboardQuerySchema } from "@/lib/validation/dashboard";
import { cleanupTenant, createCompletedSession, createTenant, type TestTenant } from "../helpers/tenant";
import { insertBill, insertCustomer } from "./helpers";

/** The dashboard date filter: every range-driven figure covers exactly the chosen days. */

let t: TestTenant;
let other: TestTenant;
let alpha: string;
let beta: string;

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const june = dashboardRangeFromDays("2026-06-01", "2026-06-30");

beforeAll(async () => {
  [t, other] = await Promise.all([createTenant("dash-range"), createTenant("dash-range-other")]);
  alpha = (await insertCustomer(t, "Alpha Builders")).id;
  beta = (await insertCustomer(t, "Beta Roads")).id;
  await insertBill(t, { customerId: alpha, total: "1000.00", payments: ["400.00"], billDate: day("2026-03-10") });
  await insertBill(t, { customerId: alpha, total: "3500.00", billDate: day("2026-05-20") });
  await insertBill(t, { customerId: beta, total: "5000.00", billDate: day("2026-06-15") });
  await insertBill(t, { customerId: alpha, total: "2000.00", payments: ["2000.00"], billDate: day("2026-06-20") });
  // Edges: the last millisecond of 30 June is in, 1 July is out.
  await insertBill(t, { customerId: beta, total: "10.00", billDate: new Date("2026-06-30T23:59:59.999Z") });
  await insertBill(t, { customerId: beta, total: "99.00", billDate: day("2026-07-01") });
  // Another business's June bill must never show up.
  await insertBill(other, { total: "777.00", billDate: day("2026-06-10") });
  await createCompletedSession(t, { totalHours: 8 }); // dated 1 Oct 2026
});

afterAll(async () => {
  await Promise.all([t, other].filter(Boolean).map((x) => cleanupTenant(x.businessId)));
  await db.$disconnect();
});

describe("dashboard date range", () => {
  it("revenue, received and the trend cover the chosen days and compare with the period before", async () => {
    const { cards } = await getDashboardSummary(t.businessId, june);
    expect(cards.revenueThisMonth).toBe(7010); // 5000 + 2000 + 10
    expect(cards.amountReceivedInRange).toBe(2000);
    // previous 30 days = 2-31 May: 3500 -> (7010 - 3500) / 3500 = +100.3%
    expect(cards.revenueTrendPct).toBe(100.3);
    // all-time figures do not move with the range
    expect(cards.amountReceived).toBe(2400);
  });

  it("a financial year (1 Apr - 31 Mar) picks up only that year's bills", async () => {
    const fy = dashboardRangeFromDays("2025-04-01", "2026-03-31");
    const { cards } = await getDashboardSummary(t.businessId, fy);
    expect(cards.revenueThisMonth).toBe(1000);
    expect(rangeDays(fy)).toBe(365);
  });

  it("payment collection and top customers use bills dated in the range", async () => {
    const pc = await getPaymentCollectionStatus(t.businessId, june);
    expect(pc).toMatchObject({ totalBilled: 7010, totalReceived: 2000, totalPending: 5010, paidCount: 1, overdueCount: 1 });
    const top = await getTopCustomersByRevenue(t.businessId, 5, june);
    expect(top.map((c) => [c.name, c.revenue])).toEqual([
      ["Beta Roads", 5010],
      ["Alpha Builders", 2000],
    ]);
  });

  it("profit and machine hours follow the range", async () => {
    const profit = await getProfitOverview(t.businessId, june);
    expect(profit.revenue).toBe(7010);
    const octHours = await getMachineHoursDetail(t.businessId, dashboardRangeFromDays("2026-10-01", "2026-10-31"));
    const juneHours = await getMachineHoursDetail(t.businessId, june);
    expect(octHours.find((m) => m.id === t.excavatorId)?.hours).toBe(8);
    expect(juneHours.find((m) => m.id === t.excavatorId)?.hours).toBe(0);
  });

  it("salary over a range is prorated by days and never counts days after today", async () => {
    const now = new Date("2026-07-15T12:00:00.000Z");
    const full = await salaryCostForRange(t.businessId, june, now);
    const firstHalf = await salaryCostForRange(t.businessId, dashboardRangeFromDays("2026-06-01", "2026-06-15"), now);
    expect(firstHalf.times(2).toFixed(2)).toBe(full.toFixed(2));
    const future = await salaryCostForRange(t.businessId, dashboardRangeFromDays("2026-08-01", "2026-08-31"), now);
    expect(future.toFixed(2)).toBe("0.00");
  });
});

describe("dashboard query", () => {
  it("takes both dates or neither, in order, and not an endless range", () => {
    expect(dashboardQuerySchema.safeParse({}).success).toBe(true);
    expect(dashboardQuerySchema.safeParse({ from: "2026-06-01", to: "2026-06-30" }).success).toBe(true);
    expect(dashboardQuerySchema.safeParse({ from: "2026-06-01" }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ from: "2026-06-30", to: "2026-06-01" }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ from: "2016-01-01", to: "2026-06-01" }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ from: "01-06-2026", to: "2026-06-30" }).success).toBe(false);
  });
});
