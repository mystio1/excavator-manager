import "../bills/pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createBill } from "@/lib/services/bills";
import { getRecordedHoursForBilling } from "@/lib/services/siteAnalysis";
import { directBillHoursQuerySchema, generateBillSchema } from "@/lib/validation/bill";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { buildScenario, type Scenario } from "./fixture";

/**
 * Direct bill hours come from Site Analysis: one machine, one customer, a period — approved work
 * only, split Bucket / Breaker, and work already on a bill is left out (never billed twice).
 */

let t: TestTenant;
let other: TestTenant;
let sc: Scenario;

beforeAll(async () => {
  [t, other] = await Promise.all([createTenant("direct-hours"), createTenant("direct-hours-other")]);
  sc = await buildScenario(t);
});

afterAll(async () => {
  await Promise.all([t, other].filter(Boolean).map((x) => cleanupTenant(x.businessId)));
  await db.$disconnect();
});

const pc200 = () => sc.machines.find((m) => m.key === "pc200")!;

describe("recorded hours for a direct bill", () => {
  it("sums the machine's approved Bucket / Breaker hours for the customer between the dates", async () => {
    // PC200: 15 h bucket on 1-10 Sep, 10 h breaker on 11-14 Sep. 1-12 Sep = 10 x 15 + 2 x 10.
    const h = await getRecordedHoursForBilling(t.businessId, {
      customerId: sc.customerId,
      excavatorId: pc200().excavatorId,
      from: "2026-09-01",
      to: "2026-09-12",
    });
    expect(h).toEqual({ bucket: 150, breaker: 20, other: 0, billed: 0, days: 12, sites: ["XYZ Construction Site"] });
  });

  it("leaves out pending / rejected readings, other customers and other businesses", async () => {
    // 20-21 Sep only hold a PENDING and a REJECTED reading for PC200.
    const pendingOnly = await getRecordedHoursForBilling(t.businessId, {
      customerId: sc.customerId,
      excavatorId: pc200().excavatorId,
      from: "2026-09-20",
      to: "2026-09-21",
    });
    expect(pendingOnly).toMatchObject({ bucket: 0, breaker: 0, days: 0 });

    const otherCustomer = await db.customer.create({ data: { businessId: t.businessId, name: "Someone Else", mobile: "9000000099" } });
    const wrongCustomer = await getRecordedHoursForBilling(t.businessId, {
      customerId: otherCustomer.id,
      excavatorId: pc200().excavatorId,
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(wrongCustomer).toMatchObject({ bucket: 0, breaker: 0 });

    const wrongBusiness = await getRecordedHoursForBilling(other.businessId, {
      customerId: sc.customerId,
      excavatorId: pc200().excavatorId,
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(wrongBusiness).toMatchObject({ bucket: 0, breaker: 0, billed: 0 });
  });

  it("work already on a bill is reported as billed, not suggested again", async () => {
    await createBill(
      t.businessId,
      t.actor,
      generateBillSchema.parse({
        customerId: sc.customerId,
        workSessionIds: [pc200().sessionId],
        billDate: "2026-10-01",
        ratePerHour: 1000,
        billType: "NON_GST",
      }),
    );
    const h = await getRecordedHoursForBilling(t.businessId, {
      customerId: sc.customerId,
      excavatorId: pc200().excavatorId,
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(h).toMatchObject({ bucket: 0, breaker: 0, billed: 190, days: 0, sites: [] });
  });

  it("the query needs both ids and an ordered pair of dates", () => {
    const ok = { customerId: "c", excavatorId: "e", from: "2026-09-01", to: "2026-09-02" };
    expect(directBillHoursQuerySchema.safeParse(ok).success).toBe(true);
    expect(directBillHoursQuerySchema.safeParse({ ...ok, from: "2026-09-03" }).success).toBe(false);
    expect(directBillHoursQuerySchema.safeParse({ ...ok, excavatorId: "" }).success).toBe(false);
    expect(directBillHoursQuerySchema.safeParse({ ...ok, to: "02-09-2026" }).success).toBe(false);
  });
});
