import "../bills/pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { dashboardRangeFromDays, getProfitOverview, salaryCostForRange } from "@/lib/services/dashboard";
import { createExpense, deleteExpense, listExpenses } from "@/lib/services/expenses";
import { updateDieselPrice } from "@/lib/services/settings";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { buildScenario, type Scenario } from "../sites/fixture";

/**
 * Business Profit = what every machine earned (Site Analysis valuation + bill lines not tied to
 * work + bill charges) - (operator salary + diesel + maintenance + other expenses), worked by hand.
 *
 * Scenario (September 2026): work worth 6,12,750 at site rates, nothing billed.
 * Diesel litres recorded: PC200 540 L (incl. a 20 L top-up), JCB 391.5 L, PC210 310 L.
 */

let t: TestTenant;
let other: TestTenant;
let sc: Scenario;
const sep = dashboardRangeFromDays("2026-09-01", "2026-09-30");
const machine = (key: string) => sc.machines.find((m) => m.key === key)!;

beforeAll(async () => {
  [t, other] = await Promise.all([createTenant("profit"), createTenant("profit-other")]);
  sc = await buildScenario(t);
  // A direct bill in the period: 10,000 of hire + 500 transport (+ GST, which is not revenue).
  await db.bill.create({
    data: {
      businessId: t.businessId,
      billNumber: `TST-DIR-${Date.now()}`,
      billType: "GST",
      customerId: sc.customerId,
      billDate: new Date("2026-09-20T00:00:00.000Z"),
      isDirect: true,
      excavatorId: machine("jcb").excavatorId,
      subtotal: "10000.00",
      transportCharges: "500.00",
      gstPercentage: "18.00",
      cgst: "945.00",
      sgst: "945.00",
      totalAmount: "12390.00",
      letterhead: {},
    },
  });
  await db.serviceRecord.create({
    data: { businessId: t.businessId, excavatorId: machine("pc210").excavatorId, serviceDate: new Date("2026-09-15T00:00:00.000Z"), hourMeterAtService: 1200, cost: "800.00" },
  });
});

afterAll(async () => {
  await Promise.all([t, other].filter(Boolean).map((x) => cleanupTenant(x.businessId)));
  await db.$disconnect();
});

describe("business profit", () => {
  it("revenue is all machines' work at site rates plus bill lines and charges, never GST", async () => {
    const p = await getProfitOverview(t.businessId, sep);
    expect(p.details.revenue).toMatchObject({
      work: 612750,
      workBilled: 0,
      workUnbilled: 612750,
      unpricedHours: 0,
      otherBillLines: 10000,
      charges: 500,
    });
    expect(p.revenue).toBe(623250);
  });

  it("without a diesel price, litres are reported as not costed", async () => {
    const p = await getProfitOverview(t.businessId, sep);
    expect(p.details.expenses.diesel).toBe(0);
    expect(p.details.expenses.uncostedLitres).toBe(1241.5); // 540 + 391.5 + 310
  });

  it("diesel: a machine's recorded purchases replace litres x price; the rest use the price", async () => {
    await updateDieselPrice(t.businessId, t.actor, 90);
    const purchase = await createExpense(t.businessId, t.actor, {
      excavatorId: machine("pc200").excavatorId,
      date: "2026-09-05",
      type: "DIESEL",
      amount: 5000,
    });
    await createExpense(t.businessId, t.actor, { excavatorId: machine("jcb").excavatorId, date: "2026-09-07", type: "REPAIR", amount: 1200 });
    await createExpense(t.businessId, t.actor, { excavatorId: machine("jcb").excavatorId, date: "2026-09-08", type: "OTHER", amount: 300 });
    // Outside the period: never counted.
    await createExpense(t.businessId, t.actor, { excavatorId: machine("jcb").excavatorId, date: "2026-10-01", type: "REPAIR", amount: 99999 });

    const p = await getProfitOverview(t.businessId, sep);
    const e = p.details.expenses;
    // PC200: purchases 5,000. JCB: 391.5 x 90 = 35,235. PC210: 310 x 90 = 27,900.
    expect(Object.fromEntries(e.dieselMachines.map((m) => [m.name, [m.method, m.cost]]))).toEqual({
      "Komatsu PC200": ["purchases", 5000],
      "JCB 3DX": ["litres", 35235],
      "Komatsu PC210": ["litres", 27900],
    });
    expect(e.diesel).toBe(68135);
    expect(e.uncostedLitres).toBe(0);
    expect(e.service).toBe(800);
    expect(e.repairs).toBe(1200);
    expect(e.other).toBe(300);

    const salary = (await salaryCostForRange(t.businessId, sep)).toNumber();
    expect(e.salary).toBe(salary);
    const expenses = Math.round((salary + 68135 + 2000 + 300) * 100) / 100;
    expect(p.expenses).toBe(expenses);
    expect(p.netProfit).toBe(Math.round((623250 - expenses) * 100) / 100);

    // Deleting the purchase sends PC200 back to litres x price: 540 x 90 = 48,600.
    if ("error" in purchase) throw new Error(purchase.error);
    await deleteExpense(t.businessId, t.actor, purchase.expense.id);
    const after = await getProfitOverview(t.businessId, sep);
    expect(after.details.expenses.dieselMachines.find((m) => m.name === "Komatsu PC200")).toMatchObject({ method: "litres", cost: 48600 });
  });

  it("expenses are tenant-scoped: another business can neither see nor delete them, nor use our machines", async () => {
    const mine = await listExpenses(t.businessId);
    expect(mine.length).toBeGreaterThan(0);
    expect(await listExpenses(other.businessId)).toEqual([]);
    const result = await deleteExpense(other.businessId, other.actor, mine[0].id);
    expect("error" in result && result.code).toBe("NOT_FOUND");
    const foreign = await createExpense(other.businessId, other.actor, {
      excavatorId: machine("jcb").excavatorId,
      date: "2026-09-10",
      type: "DIESEL",
      amount: 1,
    });
    expect("error" in foreign && foreign.code).toBe("NOT_FOUND");
    const p = await getProfitOverview(other.businessId, sep);
    expect(p).toMatchObject({ revenue: 0, expenses: 0 });
  });
});
