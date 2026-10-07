import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { AuditActor } from "@/lib/audit";
import { allowAuditPurgeInTransaction } from "@/lib/audit";

/**
 * Throwaway tenant for DB-backed tests. Every test file creates its own
 * tenant(s) (unique business code, prefix "TST") and removes them in
 * afterAll(), so tests never touch real data and can run side by side.
 */
export type TestTenant = {
  businessId: string;
  businessCode: string;
  userId: string;
  actor: AuditActor;
  customerId: string;
  excavatorId: string;
  operatorId: string;
  siteId: string;
};

export async function createTenant(label = "t"): Promise<TestTenant> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  const business = await db.business.create({
    data: {
      name: `TST ${label} ${suffix}`,
      ownerName: "Test Owner",
      phone: "9000000000",
      code: `TST${suffix}`,
    },
  });
  const user = await db.user.create({
    data: {
      businessId: business.id,
      name: "Test Owner",
      email: `tst-${suffix.toLowerCase()}@example.test`,
      passwordHash: "x",
      role: "OWNER",
    },
  });
  const [customer, excavator, operator, site] = await Promise.all([
    db.customer.create({ data: { businessId: business.id, name: "Test Customer", mobile: "9111111111" } }),
    db.excavator.create({ data: { businessId: business.id, name: "Test JCB", machineNumber: "TST-1" } }),
    db.operator.create({ data: { businessId: business.id, name: "Test Operator", mobile: "9222222222" } }),
    db.site.create({ data: { businessId: business.id, name: "Test Site" } }),
  ]);
  return {
    businessId: business.id,
    businessCode: business.code,
    userId: user.id,
    actor: { type: "OWNER", id: user.id, name: user.name },
    customerId: customer.id,
    excavatorId: excavator.id,
    operatorId: operator.id,
    siteId: site.id,
  };
}

/** A completed, unbilled work session (default 8 h) ready to be billed. */
export async function createCompletedSession(
  t: TestTenant,
  opts?: { totalHours?: number; siteId?: string; customerId?: string },
) {
  return db.workSession.create({
    data: {
      businessId: t.businessId,
      excavatorId: t.excavatorId,
      customerId: opts?.customerId ?? t.customerId,
      siteId: opts?.siteId ?? t.siteId,
      operatorId: t.operatorId,
      startDate: new Date("2026-10-01"),
      endDate: new Date("2026-10-01"),
      startHourMeter: 100,
      endHourMeter: 100 + (opts?.totalHours ?? 8),
      totalHours: opts?.totalHours ?? 8,
      status: "COMPLETED",
    },
  });
}

/** Deletes a tenant and everything it owns, in foreign-key order. Also removes
 * its (append-only) audit rows via the explicit purge switch. */
export async function cleanupTenant(businessId: string) {
  await db.$transaction(
    async (tx) => {
      await allowAuditPurgeInTransaction(tx);
      await tx.payment.deleteMany({ where: { businessId } });
      await tx.billItem.deleteMany({ where: { bill: { businessId } } });
      await tx.bill.deleteMany({ where: { businessId } });
      await tx.dailyWorkLog.deleteMany({ where: { workSession: { businessId } } });
      await tx.operatorWorkRequest.deleteMany({ where: { businessId } });
      await tx.workSession.deleteMany({ where: { businessId } });
      await tx.serviceRecord.deleteMany({ where: { businessId } });
      await tx.excavatorExpense.deleteMany({ where: { businessId } });
      await tx.operatorTransaction.deleteMany({ where: { businessId } });
      await tx.transactionCategory.deleteMany({ where: { businessId } });
      await tx.operatorAssignment.deleteMany({ where: { businessId } });
      await tx.excavator.deleteMany({ where: { businessId } });
      await tx.operator.deleteMany({ where: { businessId } });
      await tx.customer.deleteMany({ where: { businessId } });
      await tx.site.deleteMany({ where: { businessId } });
      await tx.serviceItem.deleteMany({ where: { businessId } });
      await tx.bankAccount.deleteMany({ where: { businessId } });
      await tx.billNumberSequence.deleteMany({ where: { businessId } });
      await tx.operatorJoinRequest.deleteMany({ where: { businessId } });
      await tx.idempotencyKey.deleteMany({ where: { businessId } });
      await tx.auditLog.deleteMany({ where: { businessId } });
      await tx.user.deleteMany({ where: { businessId } });
      await tx.business.deleteMany({ where: { id: businessId } });
    },
    { timeout: 60_000 },
  );
}

export function fakeRequest(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Request {
  return new Request(url, {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
