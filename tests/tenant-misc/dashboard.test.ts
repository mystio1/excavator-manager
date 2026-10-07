import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getAlerts,
  getDashboardSummary,
  getMonthlyRevenueTrend,
  getOverduePayments,
  getPaymentCollectionStatus,
  getProfitOverview,
  getRecentActivity,
  getTopCustomersByRevenue,
} from "@/lib/services/dashboard";
import { cleanupTenant, createCompletedSession, createTenant, type TestTenant } from "../helpers/tenant";
import { insertBill, insertCustomer } from "./helpers";

/**
 * Dashboard totals are summed exactly (NUMERIC → Decimal) and sent as plain
 * numbers; they never include another tenant's rows.
 */

let a: TestTenant;
let b: TestTenant;
let custA1: string;
let custA2: string;
let custA3: string;

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

beforeAll(async () => {
  [a, b] = await Promise.all([createTenant("dash-a"), createTenant("dash-b")]);
  const [c1, c2, c3] = await Promise.all([
    insertCustomer(a, "Alpha Builders", { companyName: "Alpha Pvt" }),
    insertCustomer(a, "Beta Roads"),
    insertCustomer(a, "Gamma Fully Paid"),
  ]);
  custA1 = c1.id;
  custA2 = c2.id;
  custA3 = c3.id;

  // Tenant A, this month:
  //   Alpha: 0.10 + 0.20 + 100.30 = 100.60 billed, 0.10 + 0.20 + 50.05 = 50.35 paid (all three PARTIAL/UNPAID mix)
  await insertBill(a, { customerId: custA1, total: "0.10", payments: ["0.10"] }); // PAID
  await insertBill(a, { customerId: custA1, total: "0.20", payments: ["0.05"] }); // PARTIAL
  await insertBill(a, { customerId: custA1, total: "100.30", payments: ["50.05", "0.15"] }); // PARTIAL
  //   Beta: one unpaid bill, old enough to be overdue (40 days)
  await insertBill(a, { customerId: custA2, total: "33.33", billDate: daysAgo(40) });
  //   Gamma: fully paid
  await insertBill(a, { customerId: custA3, total: "10.00", payments: ["4.05", "5.95"] });

  // Tenant B has big, distinctive numbers that must never leak into A (or vice versa).
  const bCustomer = await insertCustomer(b, "B Customer");
  await insertBill(b, { customerId: bCustomer.id, total: "99999.99", payments: ["1000.01"] });
});

afterAll(async () => {
  await Promise.all([a, b].filter(Boolean).map((t) => cleanupTenant(t.businessId)));
});

describe("getDashboardSummary", () => {
  it("sums revenue, received and pending exactly", async () => {
    const { cards } = await getDashboardSummary(a.businessId);

    // All time: 0.10 + 0.20 + 100.30 + 33.33 + 10.00 = 143.93.
    expect(cards.totalRevenueAllTime).toBe(143.93);
    expect(cards.totalBillsCount).toBe(5);

    // received = every payment: 0.10 + 0.05 + 50.05 + 0.15 + 4.05 + 5.95 = 60.35
    expect(cards.amountReceived).toBe(60.35);

    // pending = UNPAID/PARTIAL bills only: (0.20 - 0.05) + (100.30 - 50.20) + 33.33 = 83.58
    expect(cards.pendingPayments).toBe(83.58);
    expect(cards.pendingBillsCount).toBe(3);

    // seed customer + 3 above
    expect(cards.totalCustomers).toBe(4);
  });

  it("this-month revenue only counts bills dated this month", async () => {
    const { cards } = await getDashboardSummary(a.businessId);
    const now = new Date();
    const old = daysAgo(40);
    const oldInThisMonth = old.getFullYear() === now.getFullYear() && old.getMonth() === now.getMonth();
    // 40 days ago is never in the current calendar month.
    expect(oldInThisMonth).toBe(false);
    expect(cards.revenueThisMonth).toBe(110.6);
  });

  it("returns every money figure as a JSON number with the existing card keys", async () => {
    const summary = JSON.parse(JSON.stringify(await getDashboardSummary(a.businessId)));
    for (const key of [
      "revenueThisMonth",
      "amountReceived",
      "pendingPayments",
      "totalRevenueAllTime",
      "operatorSalaryDue",
    ]) {
      expect(typeof summary.cards[key]).toBe("number");
    }
    expect(Object.keys(summary.cards)).toEqual(
      expect.arrayContaining([
        "totalExcavators",
        "working",
        "idle",
        "underService",
        "hoursThisMonth",
        "hoursTrendPct",
        "revenueThisMonth",
        "revenueTrendPct",
        "amountReceived",
        "pendingPayments",
        "pendingBillsCount",
        "totalCustomers",
        "totalRevenueAllTime",
        "totalBillsCount",
        "upcomingServices",
        "operatorSalaryDue",
        "pendingApprovalsCount",
      ]),
    );
  });

  it("never includes another tenant's rows (both directions)", async () => {
    const [aCards, bCards] = await Promise.all([
      getDashboardSummary(a.businessId).then((s) => s.cards),
      getDashboardSummary(b.businessId).then((s) => s.cards),
    ]);
    expect(bCards.totalRevenueAllTime).toBe(99999.99);
    expect(bCards.amountReceived).toBe(1000.01);
    expect(bCards.pendingPayments).toBe(98999.98);
    expect(bCards.totalBillsCount).toBe(1);
    expect(bCards.totalCustomers).toBe(2); // seed + B Customer

    expect(aCards.totalRevenueAllTime).toBe(143.93);
    expect(aCards.totalBillsCount).toBe(5);
  });
});

describe("getPaymentCollectionStatus", () => {
  it("buckets customers and totals exactly", async () => {
    const status = await getPaymentCollectionStatus(a.businessId);
    expect(status).toMatchObject({
      paidCount: 1, // Gamma
      partialCount: 1, // Alpha: paid something, still owes
      overdueCount: 1, // Beta: owes and paid nothing
      totalBilled: 143.93,
      totalReceived: 60.35,
      totalPending: 83.58,
    });
    expect(status.paidCustomers[0]).toMatchObject({ name: "Gamma Fully Paid", billed: 10, paid: 10, pending: 0 });
    expect(status.partialCustomers[0]).toMatchObject({ name: "Alpha Builders — Alpha Pvt", billed: 100.6, paid: 50.35, pending: 50.25 });
    expect(status.overdueCustomers[0]).toMatchObject({ name: "Beta Roads", billed: 33.33, paid: 0, pending: 33.33 });
  });

  it("does not see another tenant's customers", async () => {
    const status = await getPaymentCollectionStatus(b.businessId);
    expect(status.totalBilled).toBe(99999.99);
    expect([...status.paidCustomers, ...status.partialCustomers, ...status.overdueCustomers].map((c) => c.name)).toEqual([
      "B Customer",
    ]);
  });
});

describe("getTopCustomersByRevenue", () => {
  it("ranks by exact revenue with received and pending", async () => {
    const top = await getTopCustomersByRevenue(a.businessId);
    expect(top.map((t) => t.name)).toEqual(["Alpha Builders", "Beta Roads", "Gamma Fully Paid"]);
    expect(top[0]).toMatchObject({ revenue: 100.6, received: 50.35, pending: 50.25 });
    expect(top[1]).toMatchObject({ revenue: 33.33, received: 0, pending: 33.33 });
    expect(top[2]).toMatchObject({ revenue: 10, received: 10, pending: 0 });
  });

  it("is scoped to the tenant", async () => {
    const top = await getTopCustomersByRevenue(b.businessId);
    expect(top.map((t) => t.name)).toEqual(["B Customer"]);
  });
});

describe("getOverduePayments", () => {
  it("lists only unpaid / partial bills past the grace period, with an exact pending", async () => {
    const overdue = await getOverduePayments(a.businessId);
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toMatchObject({ customerName: "Beta Roads", pending: 33.33 });
    expect(overdue[0].daysOverdue).toBeGreaterThanOrEqual(24); // 40 days - 15 grace, floor
  });

  it("is scoped to the tenant", async () => {
    expect(await getOverduePayments(b.businessId)).toHaveLength(0);
  });
});

describe("getMonthlyRevenueTrend / getRecentActivity", () => {
  it("sums each month exactly and puts this month last", async () => {
    const trend = await getMonthlyRevenueTrend(a.businessId);
    expect(trend).toHaveLength(6);
    expect(trend[5].revenue).toBe(110.6);
    // The 40-day-old bill falls in an earlier month of the window.
    const earlier = trend.slice(0, 5).reduce((acc, m) => acc + Math.round(m.revenue * 100), 0);
    expect(earlier).toBe(3333);
  });

  it("activity amounts are formatted from the exact values and scoped to the tenant", async () => {
    const activity = await getRecentActivity(a.businessId, 20);
    expect(activity.some((e) => e.kind === "bill" && e.detail === "₹33.33")).toBe(true);
    expect(activity.some((e) => e.kind === "payment" && e.message.startsWith("₹50.05 received from Alpha Builders"))).toBe(true);
    expect(activity.every((e) => !e.message.includes("B Customer"))).toBe(true);
  });
});

describe("getProfitOverview", () => {
  it("subtracts exact service costs from exact revenue", async () => {
    await db.serviceRecord.create({
      data: { businessId: a.businessId, excavatorId: a.excavatorId, serviceDate: new Date(), hourMeterAtService: 10, cost: "0.10" },
    });
    await db.serviceRecord.create({
      data: { businessId: a.businessId, excavatorId: a.excavatorId, serviceDate: new Date(), hourMeterAtService: 11, cost: "0.20" },
    });

    const profit = await getProfitOverview(a.businessId);
    expect(profit.revenue).toBe(110.6);
    expect(profit.expenses).toBe(0.3); // 0.10 + 0.20, not 0.30000000000000004
    expect(profit.netProfit).toBe(110.3);
    expect(profit.breakdown).toEqual([{ label: "Service & Maintenance", amount: 0.3 }]);

    // Tenant B has no service records and its own revenue.
    const other = await getProfitOverview(b.businessId);
    expect(other.revenue).toBe(99999.99);
    expect(other.expenses).toBe(0);
  });
});

describe("getAlerts", () => {
  it("only reports the tenant's own pending approvals", async () => {
    // A pending operator reading in tenant B only.
    const session = await createCompletedSession(b);
    await db.dailyWorkLog.create({
      data: { workSessionId: session.id, date: new Date(), hoursWorked: 4, source: "OPERATOR", status: "PENDING" },
    });

    const bAlerts = await getAlerts(b.businessId);
    expect(bAlerts.some((alert) => alert.message === "1 operator reading waiting for approval")).toBe(true);

    const aAlerts = await getAlerts(a.businessId);
    expect(aAlerts.some((alert) => /waiting for approval/.test(alert.message))).toBe(false);

    // The dashboard card counts agree with the alert list.
    expect((await getDashboardSummary(b.businessId)).cards.pendingApprovalsCount).toBe(1);
    expect((await getDashboardSummary(a.businessId)).cards.pendingApprovalsCount).toBe(0);
  });
});
