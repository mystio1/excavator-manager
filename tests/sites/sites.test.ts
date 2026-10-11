import "../bills/pool";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { GET as listRoute, POST as createRoute } from "@/app/api/sites/route";
import { GET as getRoute, PATCH as patchRoute } from "@/app/api/sites/[id]/route";
import { PATCH as ratesRoute } from "@/app/api/sites/[id]/rates/route";
import { GET as analysisRoute } from "@/app/api/sites/[id]/analysis/route";
import { GET as dailyRoute } from "@/app/api/sites/[id]/daily/route";
import { GET as dieselRoute } from "@/app/api/sites/[id]/diesel/route";
import { GET as legacyRoute } from "@/app/api/site-analysis/route";
import { createSite, findOrCreateSite, updateSiteRates } from "@/lib/services/sites";
import { getSiteAnalysis, listDailyReadings, listSites } from "@/lib/services/siteAnalysis";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { insertBill } from "../tenant-misc/helpers";
import { actAs } from "../bills/session-mock";
import { body, ctx, req, type ErrorBody } from "../bills/route-helpers";

vi.mock("@/lib/session", () => import("../bills/session-mock"));

let t: TestTenant;
let other: TestTenant;

const noCtx = (h: (r: Request, c: undefined) => Promise<Response>) => (r: Request) => h(r, undefined);
const list = noCtx(listRoute);
const create = noCtx(createRoute);
const legacy = noCtx(legacyRoute);

beforeAll(async () => {
  t = await createTenant("sites");
  other = await createTenant("sites-other");
});
afterAll(async () => {
  await Promise.all([t, other].map((x) => cleanupTenant(x.businessId)));
  await db.$disconnect();
});
beforeEach(() => actAs(t));

/** A job without daily logs (operator flow): one entry dated startDate with totalHours. */
async function sessionless(
  tenant: TestTenant,
  siteId: string,
  o: { date: string; hours: number; attachment?: string | null; diesel?: number; excavatorId?: string; customerId?: string; status?: string },
) {
  return db.workSession.create({
    data: {
      businessId: tenant.businessId,
      excavatorId: o.excavatorId ?? tenant.excavatorId,
      customerId: o.customerId ?? tenant.customerId,
      siteId,
      operatorId: tenant.operatorId,
      startDate: new Date(o.date),
      endDate: new Date(o.date),
      startHourMeter: 100,
      endHourMeter: 100 + o.hours,
      totalHours: o.hours,
      attachment: o.attachment ?? null,
      dieselLiters: o.diesel ?? null,
      status: o.status ?? "COMPLETED",
    },
  });
}

describe("create / edit sites", () => {
  it("creates a self site without a customer and a customer site with one", async () => {
    const self = await createSite(t.businessId, t.actor, { name: "Own Yard", type: "SELF_SITE", status: "ACTIVE", customerId: t.customerId });
    if ("error" in self) throw new Error(self.error);
    expect(self.site.type).toBe("SELF_SITE");
    expect(self.site.customerId).toBeNull(); // a self site never keeps a customer

    const cust = await createSite(t.businessId, t.actor, { name: "Client Site", type: "CUSTOMER_SITE", status: "ACTIVE", customerId: t.customerId, bucketRate: 1000 });
    if ("error" in cust) throw new Error(cust.error);
    expect(cust.site.customerId).toBe(t.customerId);
    const hist = await db.siteRateHistory.findMany({ where: { siteId: cust.site.id } });
    expect(hist).toHaveLength(1);
    expect(hist[0].bucketRate?.toNumber()).toBe(1000);
    const audit = await db.auditLog.findFirst({ where: { businessId: t.businessId, entityId: cust.site.id, action: "site.create" } });
    expect(audit).not.toBeNull();
  });

  it("refuses duplicate names, foreign customers and customer sites without a customer (route)", async () => {
    const dup = await create(req("POST", "/api/sites", { body: { name: "own yard", type: "SELF_SITE" } }));
    expect(dup.status).toBe(409);
    expect((await body<ErrorBody>(dup)).code).toBe("CONFLICT");

    const foreign = await create(req("POST", "/api/sites", { body: { name: "Foreign", type: "CUSTOMER_SITE", customerId: other.customerId } }));
    expect(foreign.status).toBe(404);

    const missing = await create(req("POST", "/api/sites", { body: { name: "No Customer", type: "CUSTOMER_SITE" } }));
    expect(missing.status).toBe(422);

    const badType = await create(req("POST", "/api/sites", { body: { name: "X", type: "WEIRD" } }));
    expect(badType.status).toBe(422);
  });

  it("findOrCreateSite still creates customer sites by default", async () => {
    const s = await findOrCreateSite(t.businessId, "Legacy Created");
    expect(s.type).toBe("CUSTOMER_SITE");
    expect(s.status).toBe("ACTIVE");
    expect((await findOrCreateSite(t.businessId, "  legacy created ")).id).toBe(s.id);
  });

  it("PATCH edits basics with expectedVersion, bumps the version and audits; stale -> 409", async () => {
    const created = await createSite(t.businessId, t.actor, { name: "Edit Me", type: "CUSTOMER_SITE", status: "ACTIVE", customerId: t.customerId });
    if ("error" in created) throw new Error(created.error);
    const id = created.site.id;
    const ok = await patchRoute(req("PATCH", `/x`, { body: { status: "ON_HOLD", address: "Baner", name: "Edited", expectedVersion: 0 } }), ctx({ id }));
    expect(ok.status).toBe(200);
    const row = await db.site.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "ON_HOLD", address: "Baner", name: "Edited", version: 1 });
    const stale = await patchRoute(req("PATCH", `/x`, { body: { status: "COMPLETED", expectedVersion: 0 } }), ctx({ id }));
    expect(stale.status).toBe(409);
    expect((await body<ErrorBody>(stale)).code).toBe("RESOURCE_MODIFIED");
    expect((await db.site.findUniqueOrThrow({ where: { id } })).status).toBe("ON_HOLD");
    expect(await db.auditLog.count({ where: { businessId: t.businessId, entityId: id, action: "site.update" } })).toBe(1);
  });

  it("other tenants get 404 on every site route", async () => {
    actAs(other);
    const id = (await db.site.findFirstOrThrow({ where: { businessId: t.businessId } })).id;
    expect((await getRoute(req("GET", "/x"), ctx({ id }))).status).toBe(404);
    expect((await analysisRoute(req("GET", "/x"), ctx({ id }))).status).toBe(404);
    expect((await dailyRoute(req("GET", "/x"), ctx({ id }))).status).toBe(404);
    expect((await dieselRoute(req("GET", "/x"), ctx({ id }))).status).toBe(404);
    expect((await patchRoute(req("PATCH", "/x", { body: { status: "COMPLETED" } }), ctx({ id }))).status).toBe(404);
    expect((await ratesRoute(req("PATCH", "/x", { body: { bucketRate: 1, breakerRate: 1 } }), ctx({ id }))).status).toBe(404);
    expect((await db.site.findUniqueOrThrow({ where: { id } })).status).not.toBe("COMPLETED");
  });
});

describe("site list: filters, aggregation and pagination", () => {
  let tl: TestTenant;
  let ids: Record<string, string>;
  let machineB: string;

  beforeAll(async () => {
    tl = await createTenant("site-list");
    const cust = await db.customer.create({ data: { businessId: tl.businessId, name: "Zenith Infra", mobile: "9000011111" } });
    const mk = async (name: string, o: { type?: "SELF_SITE" | "CUSTOMER_SITE"; status?: string; address?: string; customer?: boolean; bucket?: number }) => {
      const r = await createSite(tl.businessId, tl.actor, {
        name,
        type: o.type ?? "CUSTOMER_SITE",
        status: (o.status ?? "ACTIVE") as "ACTIVE",
        customerId: o.customer === false || o.type === "SELF_SITE" ? undefined : cust.id,
        address: o.address,
        bucketRate: o.bucket,
      });
      if ("error" in r) throw new Error(r.error);
      return r.site.id;
    };
    ids = {
      alpha: await mk("Alpha Towers", { address: "Hinjewadi", bucket: 1000 }),
      bravo: await mk("Bravo Mall", { status: "COMPLETED", address: "Wakad", bucket: 1000 }),
      charlie: await mk("Charlie Yard", { type: "SELF_SITE", address: "Pirangut", bucket: 900 }),
      delta: await mk("Delta Bridge", { status: "ON_HOLD", address: "Hadapsar", bucket: 1000 }),
      echo: await mk("Echo Park", { address: "Baner" }),
    };
    machineB = (await db.excavator.create({ data: { businessId: tl.businessId, name: "Second Machine" } })).id;
    // alpha: 10 h bucket on 2026-01-10 + 5 h on 2026-02-10 (machine 1), bravo: 8 h by machine B
    await sessionless(tl, ids.alpha, { date: "2026-01-10", hours: 10, attachment: "Bucket", customerId: cust.id });
    await sessionless(tl, ids.alpha, { date: "2026-02-10", hours: 5, attachment: "Bucket", customerId: cust.id });
    await sessionless(tl, ids.bravo, { date: "2026-01-12", hours: 8, attachment: "Bucket", excavatorId: machineB, customerId: cust.id });
    await sessionless(tl, ids.charlie, { date: "2026-01-15", hours: 4, attachment: "Bucket" });
  });
  afterAll(() => cleanupTenant(tl.businessId));

  it("lists customer and self sites with customer name, aggregates and last work date", async () => {
    const r = await listSites(tl.businessId, { q: undefined });
    const by = Object.fromEntries(r.sites.map((s) => [s.name, s]));
    expect(by["Alpha Towers"]).toMatchObject({ customerName: "Zenith Infra", location: "Hinjewadi", totalHours: 15, revenue: 15000, pending: 15000, lastWorkDate: "2026-02-10", bucketRate: 1000, breakerRate: null });
    expect(by["Charlie Yard"]).toMatchObject({ type: "SELF_SITE", customerName: "Self Site", totalHours: 4, revenue: 3600 });
    expect(by["Echo Park"]).toMatchObject({ totalHours: 0, revenue: 0, lastWorkDate: null });
    // alphabetical, seed site included
    expect(r.sites.map((s) => s.name)).toEqual([...r.sites.map((s) => s.name)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    expect(r.summary.totalHours).toBe(27);
    expect(r.summary.revenue).toBe(15000 + 8000 + 3600);
  });

  it("search matches site name, customer name and location", async () => {
    const names = async (q: string) => (await listSites(tl.businessId, { q })).sites.map((s) => s.name);
    expect(await names("alpha")).toEqual(["Alpha Towers"]);
    expect(await names("wakad")).toEqual(["Bravo Mall"]);
    expect((await names("zenith")).sort()).toEqual(["Alpha Towers", "Bravo Mall", "Delta Bridge", "Echo Park"]);
    expect(await names("%")).toEqual([]); // wildcard characters are literal
  });

  it("type, status and machine filters", async () => {
    const names = async (f: Parameters<typeof listSites>[1]) => (await listSites(tl.businessId, f)).sites.map((s) => s.name);
    expect(await names({ type: "SELF_SITE" })).toEqual(["Charlie Yard"]);
    expect(await names({ status: "COMPLETED" })).toEqual(["Bravo Mall"]);
    expect(await names({ status: "ON_HOLD" })).toEqual(["Delta Bridge"]);
    expect(await names({ excavatorId: machineB })).toEqual(["Bravo Mall"]);
    const withMachine = await listSites(tl.businessId, { excavatorId: tl.excavatorId });
    expect(withMachine.sites.map((s) => s.name)).toEqual(["Alpha Towers", "Charlie Yard"]);
    expect(withMachine.sites[0].totalHours).toBe(15);
  });

  it("date range restricts the figures", async () => {
    const r = await listSites(tl.businessId, { q: "alpha", from: "2026-02-01", to: "2026-02-28" });
    expect(r.sites[0]).toMatchObject({ totalHours: 5, revenue: 5000, lastWorkDate: "2026-02-10" });
    expect(r.summary.totalHours).toBe(5);
  });

  it("paginates on the server", async () => {
    const p1 = await listSites(tl.businessId, { page: 1, pageSize: 3 });
    const p2 = await listSites(tl.businessId, { page: 2, pageSize: 3 });
    expect(p1.total).toBe(6); // 5 + the tenant seed site
    expect(p1.totalPages).toBe(2);
    expect(p1.sites).toHaveLength(3);
    expect(p2.sites).toHaveLength(3);
    expect(new Set([...p1.sites, ...p2.sites].map((s) => s.id)).size).toBe(6);
    // summary covers the whole filtered list, not the page
    expect(p1.summary.totalHours).toBe(27);
  });

  it("the route returns the same shape and validates query params", async () => {
    actAs(tl);
    const res = await list(req("GET", "/api/sites?type=SELF_SITE&page=1&pageSize=5"));
    expect(res.status).toBe(200);
    const b = await body<{ sites: { name: string }[]; total: number }>(res);
    expect(b.sites.map((s) => s.name)).toEqual(["Charlie Yard"]);
    expect((await list(req("GET", "/api/sites?type=BOGUS"))).status).toBe(422);
    expect((await list(req("GET", "/api/sites?from=notadate"))).status).toBe(422);
  });
});

describe("work entries: sessionless jobs, flagged meters, other work", () => {
  it("counts a log-less session as one entry; Chaining is unpriced 'other' hours with a reading difference", async () => {
    const r = await createSite(t.businessId, t.actor, { name: "Entries Site", type: "SELF_SITE", status: "ACTIVE", bucketRate: 1000, breakerRate: 2000 });
    if ("error" in r) throw new Error(r.error);
    const siteId = r.site.id;
    await sessionless(t, siteId, { date: "2026-03-01", hours: 6, attachment: "Bucket", diesel: 12 });
    await sessionless(t, siteId, { date: "2026-03-02", hours: 4, attachment: "Chaining" });
    await sessionless(t, siteId, { date: "2026-03-03", hours: 0, status: "ACTIVE" }); // running job, nothing yet: skipped
    // a session whose only log is PENDING contributes nothing (the log is not approved)
    const pendingOnly = await sessionless(t, siteId, { date: "2026-03-04", hours: 50, attachment: "Bucket" });
    await db.dailyWorkLog.create({ data: { workSessionId: pendingOnly.id, date: new Date("2026-03-04"), hoursWorked: 50, attachment: "Bucket", status: "PENDING" } });
    // a stored end reading below the start is flagged and falls back to hoursWorked
    const withLogs = await sessionless(t, siteId, { date: "2026-03-05", hours: 3 });
    await db.dailyWorkLog.create({ data: { workSessionId: withLogs.id, date: new Date("2026-03-05"), startHourMeter: 500, endHourMeter: 490, hoursWorked: 3, attachment: "Breaker", status: "APPROVED" } });

    const a = (await getSiteAnalysis(t.businessId, siteId))!;
    expect(a.summary).toMatchObject({ hours: 13, bucketHours: 6, breakerHours: 3, otherHours: 4, diesel: 12, revenue: 6000 + 6000 });
    expect(a.workType.other).toMatchObject({ hours: 4, revenue: 0 });
    expect(a.diesel.avgPerHour).toBeCloseTo(12 / 13, 2);

    const d = (await listDailyReadings(t.businessId, siteId, { pageSize: 50 }))!;
    const chain = d.rows.find((x) => x.date === "2026-03-02")!;
    expect(chain).toMatchObject({ totalHours: 4, bucketHours: 0, brekarHours: 0, otherHours: 4, readingDifference: 4 });
    const flagged = d.rows.find((x) => x.date === "2026-03-05")!;
    expect(flagged).toMatchObject({ flagged: true, totalHours: 3, startReading: 500, endReading: 490 });
    expect(d.rows.some((x) => x.date === "2026-03-04")).toBe(false);
    const bucket = d.rows.find((x) => x.date === "2026-03-01")!;
    expect(bucket).toMatchObject({ totalHours: 6, bucketHours: 6, readingDifference: 0, diesel: 12, average: 2 });
  });
});

describe("rates: effective-dated history, bills keep their snapshot", () => {
  it("a rate change does not alter earlier work or any bill; versioned and audited", async () => {
    const r = await createSite(t.businessId, t.actor, { name: "Rates Site", type: "CUSTOMER_SITE", status: "ACTIVE", customerId: t.customerId, bucketRate: 1000, breakerRate: 1500 });
    if ("error" in r) throw new Error(r.error);
    const siteId = r.site.id;
    const jan = await sessionless(t, siteId, { date: "2026-01-10", hours: 10, attachment: "Bucket" });
    await sessionless(t, siteId, { date: "2026-03-10", hours: 10, attachment: "Bucket" });
    const billed = await sessionless(t, siteId, { date: "2026-01-20", hours: 10, attachment: "Bucket" });
    // the Jan 20 job was invoiced with a discount: 9,000 instead of 10,000
    const bill = await insertBill(t, { total: "9000.00", payments: ["3000"] });
    await db.billItem.create({
      data: { billId: bill.id, excavatorId: t.excavatorId, workSessionId: billed.id, siteName: "Rates Site", fromDate: new Date("2026-01-20"), toDate: new Date("2026-01-20"), hours: 10, ratePerHour: 900, amount: 9000 },
    });

    const before = (await getSiteAnalysis(t.businessId, siteId))!;
    expect(before.summary.revenue).toBe(10000 + 10000 + 9000);

    const res = await ratesRoute(req("PATCH", "/x", { body: { bucketRate: 1400, breakerRate: 1800, effectiveFrom: "2026-02-01", expectedVersion: before.site.version } }), ctx({ id: siteId }));
    expect(res.status).toBe(200);

    const after = (await getSiteAnalysis(t.businessId, siteId))!;
    // Jan 10 stays at 1,000, Mar 10 uses 1,400, the billed job still equals its invoice
    expect(after.summary.revenue).toBe(10000 + 14000 + 9000);
    expect(after.summary.billedRevenue).toBe(9000);
    expect(after.summary.received).toBe(3000);
    expect(after.site).toMatchObject({ bucketRate: 1400, breakerRate: 1800, version: before.site.version + 1 });
    expect(after.rateHistory.map((h) => h.effectiveFrom)).toEqual(["2026-02-01", "1970-01-01"]);

    const untouchedBill = await db.bill.findUniqueOrThrow({ where: { id: bill.id }, include: { items: true } });
    expect(untouchedBill.totalAmount.toNumber()).toBe(9000);
    expect(untouchedBill.items[0].ratePerHour.toNumber()).toBe(900);
    expect(untouchedBill.items[0].amount.toNumber()).toBe(9000);
    expect((await db.workSession.findUniqueOrThrow({ where: { id: jan.id } })).totalHours).toBe(10);

    const audit = await db.auditLog.findFirst({ where: { businessId: t.businessId, entityId: siteId, action: "site.rates" } });
    expect(audit).not.toBeNull();
    expect(audit!.details).toMatchObject({ effectiveFrom: "2026-02-01" });

    // stale version -> 409 and nothing written
    const stale = await ratesRoute(req("PATCH", "/x", { body: { bucketRate: 1, breakerRate: 1, expectedVersion: before.site.version } }), ctx({ id: siteId }));
    expect(stale.status).toBe(409);
    expect((await body<ErrorBody>(stale)).code).toBe("RESOURCE_MODIFIED");
    expect(await db.siteRateHistory.count({ where: { siteId } })).toBe(2);

    // a later change from a later date leaves the Feb-Mar valuation alone
    const again = await updateSiteRates(t.businessId, t.actor, siteId, { bucketRate: 2000, breakerRate: 2500, effectiveFrom: "2026-03-20" });
    expect("error" in again).toBe(false);
    const final = (await getSiteAnalysis(t.businessId, siteId))!;
    expect(final.summary.revenue).toBe(10000 + 14000 + 9000);
    expect(final.site.bucketRate).toBe(2000);
  });

  it("a back-dated change does not override a newer rate; future dates are refused", async () => {
    const r = await createSite(t.businessId, t.actor, { name: "Backdate Site", type: "SELF_SITE", status: "ACTIVE", bucketRate: 100 });
    if ("error" in r) throw new Error(r.error);
    const id = r.site.id;
    await updateSiteRates(t.businessId, t.actor, id, { bucketRate: 300, breakerRate: null, effectiveFrom: "2026-02-01" });
    await updateSiteRates(t.businessId, t.actor, id, { bucketRate: 200, breakerRate: null, effectiveFrom: "2026-01-01" });
    expect((await db.site.findUniqueOrThrow({ where: { id } })).bucketRate?.toNumber()).toBe(300);
    const future = await updateSiteRates(t.businessId, t.actor, id, { bucketRate: 1, breakerRate: null, effectiveFrom: "2999-01-01" });
    expect("error" in future && future.code).toBe("BAD_REQUEST");
    // each work date uses the row in force on that date
    await sessionless(t, id, { date: "2026-01-15", hours: 1, attachment: "Bucket" });
    await sessionless(t, id, { date: "2026-02-15", hours: 1, attachment: "Bucket" });
    expect((await getSiteAnalysis(t.businessId, id))!.summary.revenue).toBe(200 + 300);
  });

  it("rates route validates input", async () => {
    const id = (await db.site.findFirstOrThrow({ where: { businessId: t.businessId, name: "Rates Site" } })).id;
    expect((await ratesRoute(req("PATCH", "/x", { body: { bucketRate: -5, breakerRate: 1 } }), ctx({ id }))).status).toBe(422);
    expect((await ratesRoute(req("PATCH", "/x", { body: { bucketRate: "abc", breakerRate: 1 } }), ctx({ id }))).status).toBe(422);
  });
});

describe("API compatibility and routes", () => {
  it("the legacy /api/site-analysis response is unchanged", async () => {
    const res = await legacy(req("GET", "/api/site-analysis"));
    expect(res.status).toBe(200);
    const b = await body<Record<string, unknown>>(res);
    expect(Object.keys(b).sort()).toEqual(["customerOptions", "readings", "siteOptions"]);
  });

  it("analysis / daily / diesel routes respond with the documented shapes", async () => {
    const site = await db.site.findFirstOrThrow({ where: { businessId: t.businessId, name: "Entries Site" } });
    const a = await body<{ summary: { hours: number }; machines: unknown[]; site: { id: string } }>(await analysisRoute(req("GET", "/x?from=2026-03-01&to=2026-03-31"), ctx({ id: site.id })));
    expect(a.summary.hours).toBe(13);
    expect(a.site.id).toBe(site.id);
    const d = await body<{ rows: unknown[]; total: number }>(await dailyRoute(req("GET", "/x?page=1&pageSize=2"), ctx({ id: site.id })));
    expect(d.rows).toHaveLength(2);
    expect(d.total).toBe(3);
    const g = await body<{ entries: { litres: number }[]; totalLitres: number }>(await dieselRoute(req("GET", "/x"), ctx({ id: site.id })));
    expect(g.totalLitres).toBe(12);
    expect(g.entries.map((e) => e.litres)).toEqual([12]);
    const bad = await analysisRoute(req("GET", "/x?excavatorId=" + other.excavatorId), ctx({ id: site.id }));
    expect(bad.status).toBe(404);
  });
});
