import "./pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createBill, createDirectBill, createSummaryBill, getBillDetail } from "@/lib/services/bills";
import { getBillSummaryRows } from "@/lib/services/billSummary";
import { updateBillTemplate } from "@/lib/services/settings";
import { rowsFromLines, summaryTotals, type SummaryRow } from "@/components/bill/summary-rows";
import { generateBillSchema } from "@/lib/validation/bill";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { buildScenario, type Scenario } from "../sites/fixture";
import { directInput, ok, summaryInput } from "./helpers";

/**
 * Daily Summary bill template: day rows that always add up to the bill, and the owner's own sheet
 * arithmetic (PC 200, June 2026: 200,700 of work - 1,090 L x 98.50 diesel = 93,335).
 */

let t: TestTenant;
let sc: Scenario;

beforeAll(async () => {
  t = await createTenant("summary-template");
  sc = await buildScenario(t);
});

afterAll(async () => {
  if (t) await cleanupTenant(t.businessId);
  await db.$disconnect();
});

const detail = async (id: string) => (await getBillDetail(t.businessId, id))!;
const machine = (key: string) => sc.machines.find((m) => m.key === key)!;

describe("sheet arithmetic", () => {
  it("matches the owner's PC 200 June sheet", () => {
    // [hours, rate, type, diesel] per the sheet
    const data: [number, number, string, number][] = [
      [2.4, 2200, "Bucket", 0], [1.8, 2200, "Bucket", 200], [2.4, 2200, "Bucket", 0], [4.1, 2200, "Bucket", 0],
      [1.8, 2200, "Bucket", 0], [2.2, 2300, "Breaker", 0], [7.6, 2300, "Breaker", 0], [3.3, 2200, "Bucket", 100],
      [0.4, 2200, "Bucket", 100], [5.8, 2200, "Bucket", 0], [2.3, 2200, "Bucket", 200], [2.7, 2300, "Breaker", 0],
      [7.6, 2300, "Breaker", 0], [7.7, 2200, "Bucket", 0], [0.4, 2300, "Breaker", 0], [6.7, 2300, "Breaker", 150],
      [3.4, 2300, "Breaker", 0], [7, 2200, "Bucket", 120], [1.8, 2300, "Breaker", 0], [2.9, 2200, "Bucket", 100],
      [5.6, 2300, "Breaker", 0], [2.6, 2200, "Bucket", 120], [1.7, 2200, "Bucket", 0], [4.5, 2200, "Bucket", 0],
      [0.8, 2200, "Bucket", 0],
    ];
    const rows: SummaryRow[] = data.map(([hours, rate, type, diesel], i) => ({
      date: `2026-06-${String(i + 1).padStart(2, "0")}`,
      toDate: null,
      machine: "PC 200",
      start: null,
      stop: null,
      hours,
      rate,
      amount: Math.round(hours * rate * 100) / 100,
      type,
      diesel,
    }));
    const tot = summaryTotals(rows, 98.5);
    expect(tot).toMatchObject({ hours: 89.5, bucketHours: 51.5, breakerHours: 38, amount: 200700, dieselLitres: 1090, dieselAmount: 107365 });
    expect(tot.amount - tot.dieselAmount).toBe(93335);
  });
});

describe("rows from a saved bill", () => {
  it("a bill from work records is split into its approved daily readings, summing to the bill exactly", async () => {
    const pc200 = machine("pc200");
    const { bill } = ok(
      await createBill(
        t.businessId,
        t.actor,
        generateBillSchema.parse({ customerId: sc.customerId, workSessionIds: [pc200.sessionId], billDate: "2026-09-30", ratePerHour: 1333.33, billType: "NON_GST" }),
      ),
    );
    const rows = await getBillSummaryRows(t.businessId, await detail(bill.id));
    const work = rows.filter((r) => r.type !== "Diesel only");
    // 14 approved work days (pending / rejected readings never appear) + the approved diesel-only top-up.
    expect(work).toHaveLength(14);
    expect(rows.filter((r) => r.type === "Diesel only")).toEqual([
      expect.objectContaining({ date: "2026-09-15", hours: 0, amount: 0, diesel: 20 }),
    ]);
    expect(work[0]).toMatchObject({ date: "2026-09-01", machine: "Komatsu PC200", start: 1000, stop: 1015, hours: 15, type: "Bucket", diesel: 40 });
    const tot = summaryTotals(rows, 0);
    expect(tot.hours).toBe(190);
    expect(tot.amount).toBe(Number((await detail(bill.id)).subtotal)); // paise-exact, rounding absorbed by the last day
    expect(tot).toMatchObject({ bucketHours: 150, breakerHours: 40, dieselLitres: 540 });
  });

  it("a line whose hours were changed on the bill stays one row (never inconsistent with the bill)", async () => {
    const jcb = machine("jcb");
    const { bill } = ok(
      await createBill(
        t.businessId,
        t.actor,
        generateBillSchema.parse({ customerId: sc.customerId, workSessionIds: [jcb.sessionId], billDate: "2026-09-30", ratePerHour: 1000, billType: "NON_GST" }),
      ),
    );
    await db.billItem.updateMany({ where: { billId: bill.id }, data: { hours: "100.00", amount: "100000.00" } });
    const rows = await getBillSummaryRows(t.businessId, await detail(bill.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ hours: 100, amount: 100000, start: 1000 });
  });

  it("Summary-bill lines are one row each; a Direct bill is a Bucket and a Breaker row", async () => {
    const { bill: summary } = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
    expect(await getBillSummaryRows(t.businessId, await detail(summary.id))).toEqual([
      expect.objectContaining({ date: "2026-10-01", hours: 10, rate: 1000, amount: 10000, start: null, diesel: null }),
    ]);
    const { bill: direct } = ok(await createDirectBill(t.businessId, t.actor, directInput(t, { breakerHours: 4, breakerRate: 1500 })));
    const rows = await getBillSummaryRows(t.businessId, await detail(direct.id));
    expect(rows.map((r) => [r.type, r.hours, r.amount, r.date, r.toDate])).toEqual([
      ["Bucket", 10, 10000, "2026-10-01", "2026-10-02"],
      ["Breaker", 4, 6000, "2026-10-01", "2026-10-02"],
    ]);
  });

  it("an unsaved bill previews one row per line", () => {
    const rows = rowsFromLines({
      items: [
        { excavatorName: "B", attachment: "Breaker", fromDate: new Date("2026-06-03T00:00:00.000Z"), toDate: new Date("2026-06-03T00:00:00.000Z"), hours: 2, ratePerHour: 2300, amount: 4600 },
        { excavatorName: "A", attachment: "Bucket", fromDate: new Date("2026-06-01T00:00:00.000Z"), toDate: new Date("2026-06-02T00:00:00.000Z"), hours: 3, ratePerHour: 2200, amount: 6600 },
      ],
    });
    expect(rows.map((r) => [r.date, r.toDate, r.machine, r.type])).toEqual([
      ["2026-06-01", "2026-06-02", "A", "Bucket"],
      ["2026-06-03", null, "B", "Breaker"],
    ]);
  });
});

describe("template setting", () => {
  it("is stored per business and audited", async () => {
    await updateBillTemplate(t.businessId, t.actor, "DAILY_SUMMARY");
    expect((await db.business.findUniqueOrThrow({ where: { id: t.businessId } })).billTemplate).toBe("DAILY_SUMMARY");
    const audit = await db.auditLog.findFirst({ where: { businessId: t.businessId, action: "business.bill_template.update" } });
    expect(audit?.after).toEqual({ billTemplate: "DAILY_SUMMARY" });
  });
});
