import "../bills/pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createSite } from "@/lib/services/sites";
import { getSiteAnalysis, listDailyReadings, type DailyReadingRow } from "@/lib/services/siteAnalysis";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";

/**
 * The owner's diesel rule, end to end through the real query: each entry shows
 * its OWN L/hr, from that entry plus the immediately previous closing balance of
 * the same machine at the same site. Day 3 must read 18, not the 13/13/18 mean.
 */

type Day = { date: string; hours: number; diesel: number; closing: number | null; dieselOnly?: boolean };

let t: TestTenant;
let siteX: string;
let siteY: string;
let siteZ: string;
const machine: Record<string, string> = {};

/** One job holding every entry, or — for two entries on the same date, which
 * DailyWorkLog_session_date_live_key forbids inside one job — a job per entry. */
async function seed(name: string, siteId: string, days: Day[], jobPerEntry = false) {
  const [excavator, operator] = await Promise.all([
    db.excavator.create({ data: { businessId: t.businessId, name, machineNumber: name } }),
    db.operator.create({ data: { businessId: t.businessId, name: `Op ${name}`, mobile: `98${Math.floor(Math.random() * 1e8)}` } }),
  ]);
  const newJob = (date: string, hours: number, meter: number) =>
    db.workSession.create({
      data: {
        businessId: t.businessId,
        excavatorId: excavator.id,
        customerId: t.customerId,
        siteId,
        operatorId: operator.id,
        startDate: new Date(date),
        startHourMeter: meter,
        endHourMeter: meter + hours,
        totalHours: hours,
        attachment: "Bucket",
        status: "COMPLETED",
      },
    });

  const total = days.reduce((a, d) => a + d.hours, 0);
  const shared = jobPerEntry ? null : await newJob(days[0].date, total, 1000);
  let meter = 1000;
  for (const d of days) {
    const job = shared ?? (await newJob(d.date, d.hours, meter));
    await db.dailyWorkLog.create({
      data: {
        workSessionId: job.id,
        date: new Date(d.date),
        kind: d.dieselOnly ? "DIESEL_ONLY" : "WORK",
        startHourMeter: d.dieselOnly ? null : meter,
        endHourMeter: d.dieselOnly ? null : meter + d.hours,
        hoursWorked: d.hours,
        attachment: d.dieselOnly ? null : "Bucket",
        dieselLiters: d.diesel,
        remainingDieselLiters: d.closing,
        status: "APPROVED",
      },
    });
    meter += d.hours;
  }
  return excavator.id;
}

beforeAll(async () => {
  t = await createTenant("diesel-consumption");
  const mk = async (name: string) => {
    const r = await createSite(t.businessId, t.actor, {
      name,
      type: "CUSTOMER_SITE",
      customerId: t.customerId,
      address: "Pune",
      status: "ACTIVE",
      bucketRate: 1200,
      breakerRate: 1500,
    });
    if ("error" in r) throw new Error(r.error);
    return r.site.id;
  };
  [siteX, siteY, siteZ] = await Promise.all([mk("Site X"), mk("Site Y"), mk("Site Z")]);

  // The spec's exact table.
  machine.a = await seed("A", siteX, [
    { date: "2026-10-01", hours: 10, diesel: 200, closing: 70 },
    { date: "2026-10-02", hours: 10, diesel: 200, closing: 140 },
    { date: "2026-10-03", hours: 10, diesel: 200, closing: 160 },
  ]);
  // Same site, different machine: must not borrow A's 160 L balance.
  machine.b = await seed("B", siteX, [
    { date: "2026-10-03", hours: 10, diesel: 100, closing: 40 },
    { date: "2026-10-05", hours: 0, diesel: 50, closing: 80, dieselOnly: true },
  ]);
  // Same machine name at another site: must not borrow Site X's balance.
  machine.c = await seed("C", siteY, [{ date: "2026-10-04", hours: 10, diesel: 120, closing: 20 }]);
  // Closing higher than what was available.
  machine.d = await seed("D", siteX, [{ date: "2026-10-01", hours: 10, diesel: 50, closing: 300 }]);
  // Both fills on ONE date: they group into a single row (400 L filled, 140 L left).
  machine.e = await seed(
    "E",
    siteZ,
    [
      { date: "2026-10-12", hours: 10, diesel: 200, closing: 70 },
      { date: "2026-10-12", hours: 10, diesel: 200, closing: 140 },
    ],
    true,
  );
});

afterAll(async () => {
  if (t) await cleanupTenant(t.businessId);
  await db.$disconnect();
});

async function rowsFor(siteId: string, excavatorId: string) {
  const page = await listDailyReadings(t.businessId, siteId, { excavatorId, page: 1, pageSize: 50 });
  const byDate = new Map<string, DailyReadingRow>();
  for (const r of page!.rows) byDate.set(r.date, r);
  return byDate;
}

describe("site analysis diesel average", () => {
  it("matches the owner's Day 1/2/3 table", async () => {
    const r = await rowsFor(siteX, machine.a);

    expect(r.get("2026-10-01")).toMatchObject({ diesel: 200, closingDiesel: 70, prevClosingDiesel: null, dieselConsumed: 130, average: 13 });
    expect(r.get("2026-10-02")).toMatchObject({ diesel: 200, closingDiesel: 140, prevClosingDiesel: 70, dieselConsumed: 130, average: 13 });
    expect(r.get("2026-10-03")).toMatchObject({ diesel: 200, closingDiesel: 160, prevClosingDiesel: 140, dieselConsumed: 180, average: 18 });
  });

  it("does not accumulate history into day 3", async () => {
    const r = await rowsFor(siteX, machine.a);
    // the mean of 13, 13 and 18 is 14.67 — day 3 stands on its own at 18
    expect(r.get("2026-10-03")!.average).toBe(18);
  });

  it("keeps machines at the same site separate", async () => {
    const r = await rowsFor(siteX, machine.b);
    // B's first entry: no previous balance of its own, and A's 160 L is not borrowed
    expect(r.get("2026-10-03")).toMatchObject({ prevClosingDiesel: null, dieselConsumed: 60, average: 6 });
  });

  it("keeps the same machine's other site separate", async () => {
    const r = await rowsFor(siteY, machine.c);
    expect(r.get("2026-10-04")).toMatchObject({ prevClosingDiesel: null, dieselConsumed: 100, average: 10 });
  });

  it("shows no average for zero running hours but still carries the balance", async () => {
    const r = await rowsFor(siteX, machine.b);
    expect(r.get("2026-10-05")).toMatchObject({ prevClosingDiesel: 40, dieselConsumed: 10, average: null, dieselFlagged: false });
  });

  it("flags a closing balance higher than what was available", async () => {
    const r = await rowsFor(siteX, machine.d);
    expect(r.get("2026-10-01")).toMatchObject({ average: null, dieselFlagged: true });
  });

  it("two fills on one date group into a single row and still read 13 L/hr", async () => {
    const r = await rowsFor(siteZ, machine.e);
    // 200 + 200 filled, 140 L left at the end of the day, 20 hours worked
    expect(r.get("2026-10-12")).toMatchObject({ diesel: 400, closingDiesel: 140, dieselConsumed: 260, average: 13 });
  });

  it("the site's Average Diesel / Working Hour is burn rate, not litres filled per hour", async () => {
    const a = (await getSiteAnalysis(t.businessId, siteZ))!;
    expect(a.diesel.total).toBe(400);
    // the old ratio would have been 400 / 20 = 20 L/hr
    expect(a.diesel.avgPerHour).toBe(13);
  });
});
