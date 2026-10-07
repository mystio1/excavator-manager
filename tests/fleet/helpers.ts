import { db } from "@/lib/db";
import type { TestTenant } from "../helpers/tenant";

/** Narrows a service result to its success shape (throws, with the failure, if it failed). */
export function ok<T>(result: T): Exclude<T, { error: string }> {
  if (typeof result === "object" && result !== null && "error" in result) {
    throw new Error(`Expected success but the service refused: ${JSON.stringify(result)}`);
  }
  return result as Exclude<T, { error: string }>;
}

/** Narrows a service result to its failure shape (throws if it unexpectedly succeeded). */
export function failed<T>(result: T): Extract<T, { error: string }> {
  if (typeof result !== "object" || result === null || !("error" in result)) {
    throw new Error(`Expected a failure but the service succeeded: ${JSON.stringify(result)}`);
  }
  return result as Extract<T, { error: string }>;
}

/** A fresh machine with the tenant's operator paired to it (so a job can start
 * on it and the operator can submit readings for it). */
export function newMachine(
  t: TestTenant,
  over: { name?: string; currentHourMeter?: number; paired?: boolean } = {},
) {
  return db.excavator.create({
    data: {
      businessId: t.businessId,
      name: over.name ?? "Fleet JCB",
      startingHourMeter: 100,
      currentHourMeter: over.currentHourMeter ?? 100,
      status: "WORKING",
      currentOperatorId: over.paired === false ? null : t.operatorId,
    },
  });
}

/** A running job (status ACTIVE, 100 h on the meter) on `excavatorId`. */
export function newActiveSession(
  t: TestTenant,
  excavatorId: string,
  over: { totalHours?: number; dieselLiters?: number | null } = {},
) {
  return db.workSession.create({
    data: {
      businessId: t.businessId,
      excavatorId,
      customerId: t.customerId,
      siteId: t.siteId,
      operatorId: t.operatorId,
      startDate: new Date("2026-10-01"),
      startHourMeter: 100,
      totalHours: over.totalHours ?? 0,
      dieselLiters: over.dieselLiters ?? null,
      status: "ACTIVE",
    },
  });
}

/** Puts a bill line on a work session — the "already billed" state. */
export async function billSession(t: TestTenant, workSessionId: string, excavatorId: string, billNumber: string) {
  const bill = await db.bill.create({
    data: {
      businessId: t.businessId,
      billNumber,
      billType: "NON_GST",
      customerId: t.customerId,
      billDate: new Date("2026-10-02"),
      subtotal: "800",
      totalAmount: "800",
      letterhead: {},
    },
  });
  const item = await db.billItem.create({
    data: {
      billId: bill.id,
      excavatorId,
      workSessionId,
      siteName: "Billed Site",
      fromDate: new Date("2026-10-01"),
      toDate: new Date("2026-10-01"),
      hours: "8",
      ratePerHour: "100",
      amount: "800",
    },
  });
  return { bill, item };
}

/** The audit trail of one record, oldest first. */
export function auditRows(businessId: string, entityType: string, entityId: string) {
  return db.auditLog.findMany({ where: { businessId, entityType, entityId }, orderBy: { createdAt: "asc" } });
}

/** `before` / `after` snapshots are stored as JSON; this reads them as records. */
export const snapshot = (value: unknown) => value as Record<string, unknown>;
