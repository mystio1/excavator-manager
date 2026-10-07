import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getCustomerDetail } from "@/lib/services/customers";
import { cleanupTenant, createCompletedSession, createTenant, type TestTenant } from "../helpers/tenant";

/**
 * The customer page lists each job with every recorded value, so the admin can see (and edit) the tool, diesel,
 * readings and daily entries. Real database, throwaway tenants.
 */

let a: TestTenant;
let b: TestTenant;
let sessionId: string;

beforeAll(async () => {
  [a, b] = await Promise.all([createTenant("work-a"), createTenant("work-b")]);
  const session = await createCompletedSession(a, { totalHours: 6 });
  sessionId = session.id;
  await db.workSession.update({
    where: { id: sessionId },
    data: { attachment: "Breaker", dieselLiters: 40, dieselDate: new Date("2026-10-01"), notes: "Rock cutting" },
  });
  await db.dailyWorkLog.create({
    data: {
      workSessionId: sessionId,
      date: new Date("2026-10-01"),
      startHourMeter: 100,
      endHourMeter: 106,
      hoursWorked: 6,
      dieselLiters: 40,
      attachment: "Breaker",
      notes: "Day one",
      status: "APPROVED",
    },
  });
  await createCompletedSession(b); // another business, must never show up for A
});

afterAll(async () => {
  await Promise.all([a, b].filter(Boolean).map((t) => cleanupTenant(t.businessId)));
});

describe("customer detail work records", () => {
  it("returns every value the admin needs to view and edit a job", async () => {
    const detail = await getCustomerDetail(a.businessId, a.customerId);
    expect(detail?.machineHistory).toHaveLength(1);
    const work = detail!.machineHistory[0];
    expect(work).toMatchObject({
      id: sessionId,
      version: expect.any(Number),
      customerId: a.customerId,
      operatorId: a.operatorId,
      site: { name: "Test Site" },
      startHourMeter: 100,
      endHourMeter: 106,
      totalHours: 6,
      attachment: "Breaker",
      dieselLiters: 40,
      notes: "Rock cutting",
      billed: false,
    });
    expect(work.dieselDate).toBeInstanceOf(Date);
    expect(work.dailyLogs).toHaveLength(1);
    expect(work.dailyLogs[0]).toMatchObject({
      version: expect.any(Number),
      startHourMeter: 100,
      endHourMeter: 106,
      hoursWorked: 6,
      dieselLiters: 40,
      attachment: "Breaker",
      notes: "Day one",
      status: "APPROVED",
    });
  });

  it("keeps the fields older clients read", async () => {
    const work = (await getCustomerDetail(a.businessId, a.customerId))!.machineHistory[0];
    expect(work).toMatchObject({
      excavatorName: "Test JCB",
      machineNumber: "TST-1",
      siteName: "Test Site",
      operatorName: "Test Operator",
      status: "COMPLETED",
    });
  });

  it("never exposes operator credentials or other tenants' work", async () => {
    const detail = await getCustomerDetail(a.businessId, a.customerId);
    const text = JSON.stringify(detail);
    expect(text).not.toMatch(/pinHash|passwordHash/i);
    expect(await getCustomerDetail(b.businessId, a.customerId)).toBeNull();
  });

  it("flags a job that is already on a bill", async () => {
    const bill = await db.bill.create({
      data: {
        businessId: a.businessId,
        customerId: a.customerId,
        billNumber: `TST-${Date.now()}`,
        billType: "GST",
        billDate: new Date("2026-10-02"),
        subtotal: "100.00",
        totalAmount: "100.00",
        letterhead: {},
      },
    });
    await db.billItem.create({
      data: {
        billId: bill.id,
        excavatorId: a.excavatorId,
        workSessionId: sessionId,
        siteName: "Test Site",
        fromDate: new Date("2026-10-01"),
        toDate: new Date("2026-10-01"),
        hours: "6.00",
        ratePerHour: "100.00",
        amount: "600.00",
      },
    });
    const work = (await getCustomerDetail(a.businessId, a.customerId))!.machineHistory[0];
    expect(work.billed).toBe(true);
  });
});
