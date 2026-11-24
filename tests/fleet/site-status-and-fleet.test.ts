import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { setExcavatorSite } from "@/lib/services/excavators";
import { getFleetBySite } from "@/lib/services/siteAnalysis";
import { createSiteSchema, SITE_STATUSES, SITE_STATUS_LABEL } from "@/lib/validation/site";
import { setExcavatorSiteSchema } from "@/lib/validation/excavator";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { failed, ok } from "./helpers";

/** Moving a machine asks where the old site stands; Site Analysis shows how many machines are where. */

let t: TestTenant;
let other: TestTenant;

beforeAll(async () => {
  [t, other] = await Promise.all([createTenant("site-status"), createTenant("site-status-other")]);
});

afterAll(async () => {
  await Promise.all([t, other].filter(Boolean).map((x) => cleanupTenant(x.businessId)));
});

const siteNamed = (name: string) => db.site.findFirstOrThrow({ where: { businessId: t.businessId, name } });

describe("site statuses", () => {
  it("are Ongoing, Partially Completed, Completed and Deactive", () => {
    expect(SITE_STATUSES.map((s) => SITE_STATUS_LABEL[s])).toEqual(["Ongoing", "Partially Completed", "Completed", "Deactive"]);
    expect(createSiteSchema.safeParse({ name: "X", type: "SELF_SITE", status: "PARTIAL" }).success).toBe(true);
    expect(setExcavatorSiteSchema.safeParse({ excavatorId: "e", siteName: "S", previousSiteStatus: "GONE" }).success).toBe(false);
  });
});

describe("changing a machine's site", () => {
  it("sets the status of the site being left, and records it in the audit trail", async () => {
    ok(await setExcavatorSite(t.businessId, t.actor, t.excavatorId, "Old Quarry"));
    ok(await setExcavatorSite(t.businessId, t.actor, t.excavatorId, "New Road", { previousSiteStatus: "PARTIAL" }));
    const old = await siteNamed("Old Quarry");
    expect(old.status).toBe("PARTIAL");
    expect((await db.excavator.findUniqueOrThrow({ where: { id: t.excavatorId } })).currentSiteId).toBe((await siteNamed("New Road")).id);
    const audit = await db.auditLog.findFirst({ where: { businessId: t.businessId, entityType: "Site", entityId: old.id, action: "site.update" } });
    expect(audit?.after).toEqual({ status: "PARTIAL" });

    ok(await setExcavatorSite(t.businessId, t.actor, t.excavatorId, "Old Quarry", { previousSiteStatus: "COMPLETED" }));
    expect((await siteNamed("New Road")).status).toBe("COMPLETED");
  });

  it("leaves the old site alone when no status is given, or when the site does not change", async () => {
    ok(await setExcavatorSite(t.businessId, t.actor, t.excavatorId, "Third Site"));
    expect((await siteNamed("Old Quarry")).status).toBe("PARTIAL");
    ok(await setExcavatorSite(t.businessId, t.actor, t.excavatorId, "third site", { previousSiteStatus: "ON_HOLD" }));
    expect((await siteNamed("Third Site")).status).toBe("ACTIVE");
  });

  it("cannot touch another business's machine or site", async () => {
    expect(failed(await setExcavatorSite(other.businessId, other.actor, t.excavatorId, "Hijack", { previousSiteStatus: "COMPLETED" })).code).toBe(
      "NOT_FOUND",
    );
    expect((await siteNamed("Third Site")).status).toBe("ACTIVE");
  });
});

describe("our machines by site", () => {
  it("counts each machine at its running job's site, else its set site; the rest are at no site", async () => {
    const [m2, m3] = await Promise.all([
      db.excavator.create({ data: { businessId: t.businessId, name: "Second", status: "WORKING" } }),
      db.excavator.create({ data: { businessId: t.businessId, name: "Spare" } }),
    ]);
    const third = await siteNamed("Third Site");
    const old = await siteNamed("Old Quarry");
    await db.excavator.update({ where: { id: m2.id }, data: { currentSiteId: third.id } });
    // A running job elsewhere wins over the set site.
    await db.workSession.create({
      data: {
        businessId: t.businessId,
        excavatorId: m2.id,
        customerId: t.customerId,
        siteId: old.id,
        operatorId: t.operatorId,
        startDate: new Date("2026-11-20"),
        startHourMeter: 0,
        status: "ACTIVE",
      },
    });

    const fleet = await getFleetBySite(t.businessId);
    const at = (id: string) => fleet.sites.find((s) => s.siteId === id);
    expect(at(third.id)?.machines.map((m) => m.id)).toEqual([t.excavatorId]);
    expect(at(old.id)).toMatchObject({ siteStatus: "PARTIAL", working: 1 });
    expect(at(old.id)?.machines.map((m) => m.id)).toEqual([m2.id]);
    expect(fleet.unassigned.map((m) => m.id)).toEqual([m3.id]);
    expect(fleet.total).toBe(3);

    const theirs = await getFleetBySite(other.businessId);
    expect(theirs.sites.flatMap((s) => s.machines).some((m) => m.id === m2.id)).toBe(false);
  });
});
