import "../bills/pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getDashboardSummary } from "@/lib/services/dashboard";
import { getCustomerDetail } from "@/lib/services/customers";
import { getCustomerBillTotals } from "@/lib/services/financials";
import { getSiteAnalysis, getSiteTotals, listDailyReadings, listDieselEntries, listSites } from "@/lib/services/siteAnalysis";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { insertBill } from "../tenant-misc/helpers";
import { BREAKER_RATE, BUCKET_RATE, buildScenario, sumDiesel, sumHours, type Scenario } from "./fixture";

/**
 * The owner's scenario end to end: 390 bucket + 96.5 breaker hours = 486.5 h;
 * Rs 4,68,000 + Rs 1,44,750 = Rs 6,12,750.
 */

let t: TestTenant;
let sc: Scenario;
let other: TestTenant;

beforeAll(async () => {
  t = await createTenant("site-analysis");
  other = await createTenant("site-analysis-other");
  sc = await buildScenario(t);
});

afterAll(async () => {
  await Promise.all([t, other].filter(Boolean).map((x) => cleanupTenant(x.businessId)));
  await db.$disconnect();
});

const allLogs = () => sc.machines.flatMap((m) => m.logs);

describe("site analysis totals (owner scenario)", () => {
  it("hours, work types and revenue match the owner's figures", async () => {
    const a = (await getSiteAnalysis(t.businessId, sc.siteId))!;
    expect(a.summary.hours).toBe(486.5);
    expect(a.summary.bucketHours).toBe(390);
    expect(a.summary.breakerHours).toBe(96.5);
    expect(a.summary.otherHours).toBe(0);
    expect(a.summary.bucketRevenue).toBe(468000);
    expect(a.summary.breakerRevenue).toBe(144750);
    expect(a.summary.revenue).toBe(612750);
    expect(a.workType.totalRevenue).toBe(612750);
    expect(a.workType.bucket).toMatchObject({ hours: 390, rate: BUCKET_RATE, revenue: 468000 });
    expect(a.workType.breaker).toMatchObject({ hours: 96.5, rate: BREAKER_RATE, revenue: 144750 });
    // nothing billed yet: all revenue is unbilled and pending
    expect(a.summary.billedRevenue).toBe(0);
    expect(a.summary.unbilledRevenue).toBe(612750);
    expect(a.summary.received).toBe(0);
    expect(a.summary.pending).toBe(612750);
    expect(a.summary.machines).toBe(3);
    expect(a.site.customerName).toBe("ABC Construction");
  });

  it("PENDING / REJECTED logs are excluded; DIESEL_ONLY counts litres but no hours", async () => {
    const a = (await getSiteAnalysis(t.businessId, sc.siteId))!;
    expect(a.summary.hours).toBe(486.5); // 99 + 77 hours of unapproved logs not included
    expect(a.summary.diesel).toBe(sumDiesel(allLogs()) + sc.dieselOnlyLitres);
  });

  it("machine rows sum to the site totals and carry operator names", async () => {
    const a = (await getSiteAnalysis(t.businessId, sc.siteId))!;
    expect(a.machines).toHaveLength(3);
    const sum = (k: "hours" | "bucketHours" | "breakerHours" | "diesel" | "revenue") =>
      Math.round(a.machines.reduce((acc, m) => acc + m[k], 0) * 100) / 100;
    expect(sum("hours")).toBe(a.summary.hours);
    expect(sum("bucketHours")).toBe(a.summary.bucketHours);
    expect(sum("breakerHours")).toBe(a.summary.breakerHours);
    expect(sum("diesel")).toBe(a.summary.diesel);
    expect(sum("revenue")).toBe(a.summary.revenue);

    const byName = Object.fromEntries(a.machines.map((m) => [m.name, m]));
    expect(byName["Komatsu PC200"].operatorName).toBe("Ramesh");
    expect(byName["JCB 3DX"].operatorName).toBe("Suresh");
    expect(byName["Komatsu PC210"].operatorName).toBe("Amit");
    expect(byName["Komatsu PC200"].hours).toBe(190);
    expect(byName["Komatsu PC200"].revenue).toBe(150 * 1200 + 40 * 1500);
    expect(byName["JCB 3DX"].hours).toBe(170.5);
    expect(byName["Komatsu PC210"].hours).toBe(126);
    // average daily work = hours / days worked
    expect(byName["Komatsu PC200"].workDays).toBe(14);
    expect(byName["Komatsu PC200"].avgHoursPerDay).toBeCloseTo(190 / 14, 1);
  });

  it("daily rows sum to the machine totals; bucket + brekar hours reconcile with the meter readings", async () => {
    const a = (await getSiteAnalysis(t.businessId, sc.siteId))!;
    for (const m of sc.machines) {
      const machineTotals = a.machines.find((x) => x.excavatorId === m.excavatorId)!;
      const d = (await listDailyReadings(t.businessId, sc.siteId, { excavatorId: m.excavatorId, pageSize: 100 }))!;
      const add = (k: "totalHours" | "recordedHours" | "bucketHours" | "brekarHours" | "diesel" | "readingDifference") =>
        Math.round(d.rows.reduce((acc, r) => acc + r[k], 0) * 100) / 100;
      expect(add("recordedHours")).toBe(machineTotals.hours);
      expect(add("bucketHours")).toBe(machineTotals.bucketHours);
      expect(add("brekarHours")).toBe(machineTotals.breakerHours);
      expect(add("diesel")).toBe(machineTotals.diesel);
      // meter hours == bucket + brekar (no unassigned time in this scenario)
      expect(add("totalHours")).toBe(add("bucketHours") + add("brekarHours"));
      expect(add("readingDifference")).toBe(0);
      expect(d.rows.every((r) => !r.flagged)).toBe(true);
    }
  });

  it("daily rows are paginated server-side", async () => {
    const m = sc.machines[0];
    const p1 = (await listDailyReadings(t.businessId, sc.siteId, { excavatorId: m.excavatorId, page: 1, pageSize: 5 }))!;
    const p2 = (await listDailyReadings(t.businessId, sc.siteId, { excavatorId: m.excavatorId, page: 2, pageSize: 5 }))!;
    // 14 work days + the 15 Sep diesel-only day
    expect(p1.total).toBe(15);
    expect(p1.totalPages).toBe(3);
    expect(p1.rows).toHaveLength(5);
    expect(p2.rows).toHaveLength(5);
    expect(p1.rows[0].date > p1.rows[4].date).toBe(true); // newest first
    expect(p1.rows.map((r) => r.date)).not.toEqual(p2.rows.map((r) => r.date));
    expect(p1.rows[0]).toMatchObject({ date: "2026-09-15", diesel: 20, totalHours: 0, average: null });
  });

  it("diesel entries reconcile with the total, average per day and per hour", async () => {
    const all = (await listDieselEntries(t.businessId, sc.siteId, { pageSize: 100 }))!;
    const entrySum = Math.round(all.entries.reduce((acc, e) => acc + e.litres, 0) * 100) / 100;
    const a = (await getSiteAnalysis(t.businessId, sc.siteId))!;
    expect(entrySum).toBe(a.diesel.total);
    expect(all.totalLitres).toBe(a.diesel.total);
    expect(all.entries.some((e) => e.notes === "Top-up" && e.litres === 20)).toBe(true);
    // no closing balances in this fixture, so litres actually burned is unknown
    expect(a.diesel.avgPerHour).toBeNull();
    expect(a.diesel.avgPerDay).toBeCloseTo(a.diesel.total / a.summary.dataDays, 2);

    // two pages add up to the same figure
    const p1 = (await listDieselEntries(t.businessId, sc.siteId, { page: 1, pageSize: 10 }))!;
    const rest: number[] = [];
    for (let pg = 1; pg <= p1.totalPages; pg++) {
      const r = (await listDieselEntries(t.businessId, sc.siteId, { page: pg, pageSize: 10 }))!;
      rest.push(...r.entries.map((e) => e.litres));
    }
    expect(Math.round(rest.reduce((x, y) => x + y, 0) * 100) / 100).toBe(a.diesel.total);
    expect(rest).toHaveLength(p1.total);
  });

  it("machine filter narrows everything", async () => {
    const jcb = sc.machines[1];
    const a = (await getSiteAnalysis(t.businessId, sc.siteId, { excavatorId: jcb.excavatorId }))!;
    expect(a.summary.hours).toBe(sumHours(jcb.logs));
    expect(a.summary.bucketHours).toBe(140);
    expect(a.summary.breakerHours).toBe(30.5);
    expect(a.summary.revenue).toBe(140 * 1200 + 30.5 * 1500);
    expect(a.machines).toHaveLength(1);
    expect(a.machine).toMatchObject({ name: "JCB 3DX", machineNumber: "JCB-1" });
    expect(a.machineOptions).toHaveLength(3);
  });

  it("date filter narrows hours, work types, diesel and revenue", async () => {
    const inRange = (l: { date: string }) => l.date >= "2026-09-03" && l.date <= "2026-09-05";
    const logs = allLogs().filter(inRange);
    const a = (await getSiteAnalysis(t.businessId, sc.siteId, { from: "2026-09-03", to: "2026-09-05" }))!;
    expect(a.summary.hours).toBe(sumHours(logs));
    expect(a.summary.bucketHours).toBe(sumHours(logs, "Bucket"));
    expect(a.summary.breakerHours).toBe(sumHours(logs, "Breaker"));
    expect(a.summary.diesel).toBe(sumDiesel(logs));
    expect(a.summary.revenue).toBe(sumHours(logs, "Bucket") * 1200 + sumHours(logs, "Breaker") * 1500);
    const d = (await listDailyReadings(t.businessId, sc.siteId, { from: "2026-09-03", to: "2026-09-05", pageSize: 100 }))!;
    expect(d.rows.every((r) => r.date >= "2026-09-03" && r.date <= "2026-09-05")).toBe(true);
    // combined with a machine filter
    const b = (await getSiteAnalysis(t.businessId, sc.siteId, { from: "2026-09-03", to: "2026-09-05", excavatorId: sc.machines[2].excavatorId }))!;
    expect(b.summary.hours).toBe(60);
  });

  it("dashboard siteTotals equals the site analysis totals (612750)", async () => {
    const { siteTotals } = await getDashboardSummary(t.businessId);
    const a = (await getSiteAnalysis(t.businessId, sc.siteId))!;
    expect(siteTotals.revenue).toBe(612750);
    expect(siteTotals.revenue).toBe(a.summary.revenue);
    expect(siteTotals.totalWorkHours).toBe(486.5);
    expect(siteTotals.bucketHours).toBe(390);
    expect(siteTotals.brekarHours).toBe(96.5);
    expect(siteTotals.dieselLiters).toBe(a.summary.diesel);
    expect(siteTotals.pending).toBe(a.summary.pending);
    expect(siteTotals.activeSites).toBe(2); // the scenario site + the tenant seed site
    expect(await getSiteTotals(t.businessId)).toEqual(siteTotals);
  });

  it("machinesWorking = WORKING machines at the site (current site or active session)", async () => {
    await db.excavator.update({ where: { id: sc.machines[0].excavatorId }, data: { status: "WORKING", currentSiteId: sc.siteId } });
    // idle machine pointing at the site does not count
    await db.excavator.update({ where: { id: sc.machines[1].excavatorId }, data: { currentSiteId: sc.siteId } });
    const list = await listSites(t.businessId);
    const row = list.sites.find((x) => x.id === sc.siteId)!;
    expect(row.machinesWorking).toBe(1);
    expect(row.machinesWorkingList[0].name).toBe("Komatsu PC200");
    expect((await getSiteTotals(t.businessId)).machinesWorking).toBe(1);
    const a = (await getSiteAnalysis(t.businessId, sc.siteId))!;
    expect(a.machinesWorking.map((m) => m.name)).toEqual(["Komatsu PC200"]);
    await db.excavator.updateMany({ where: { businessId: t.businessId }, data: { status: "IDLE", currentSiteId: null } });
  });

  it("tenant isolation: another business sees nothing and gets null (404)", async () => {
    expect(await getSiteAnalysis(other.businessId, sc.siteId)).toBeNull();
    expect(await listDailyReadings(other.businessId, sc.siteId, {})).toBeNull();
    expect(await listDieselEntries(other.businessId, sc.siteId, {})).toBeNull();
    expect((await getSiteTotals(other.businessId)).revenue).toBe(0);
    // a machine of another tenant is rejected too
    expect(await getSiteAnalysis(t.businessId, sc.siteId, { excavatorId: other.excavatorId })).toBeNull();
    const list = await listSites(other.businessId);
    expect(list.sites.map((s) => s.id)).not.toContain(sc.siteId);
  });
});

describe("billing connection (customer financial summary)", () => {
  it("a bill at the site figures: billed work = invoice, received/pending allocated, customer totals consistent", async () => {
    const bill = await insertBill(t, { customerId: sc.customerId, total: "612750.00", payments: ["300000", "162000"] });
    const amounts = [240000, 213750, 159000]; // PC200, JCB, PC210 at 1,200 / 1,500
    for (const [i, m] of sc.machines.entries()) {
      const logsHours = sumHours(m.logs);
      await db.billItem.create({
        data: {
          billId: bill.id,
          excavatorId: m.excavatorId,
          workSessionId: m.sessionId,
          siteName: "XYZ Construction Site",
          fromDate: new Date("2026-09-01"),
          toDate: new Date("2026-09-14"),
          hours: logsHours,
          ratePerHour: amounts[i] / logsHours,
          amount: amounts[i],
        },
      });
    }
    const a = (await getSiteAnalysis(t.businessId, sc.siteId))!;
    expect(a.summary.billedRevenue).toBe(612750);
    expect(a.summary.unbilledRevenue).toBe(0);
    expect(a.summary.revenue).toBe(612750);
    expect(a.summary.bucketRevenue).toBe(468000); // split by valuation, not hours share
    expect(a.summary.breakerRevenue).toBe(144750);
    expect(a.summary.received).toBe(462000); // 300000 + 162000
    expect(a.summary.pending).toBe(150750);

    // customer module reads the same bill records
    expect(a.customerFinancials).toEqual({ billed: 612750, received: 462000, pending: 150750 });
    const detail = (await getCustomerDetail(t.businessId, sc.customerId))!;
    expect(detail.totalRevenue).toBe(a.summary.billedRevenue);
    expect(detail.pending).toBe(a.summary.pending);
    expect(await getCustomerBillTotals(t.businessId, sc.customerId)).toEqual(a.customerFinancials);
    const { siteTotals } = await getDashboardSummary(t.businessId);
    expect(siteTotals).toMatchObject({ revenue: 612750, received: 462000, pending: 150750 });
  });
});
