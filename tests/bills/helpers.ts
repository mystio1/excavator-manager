import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { ServiceFailure } from "@/lib/api-error";
import { generateBillSchema, generateSummaryBillSchema } from "@/lib/validation/bill";
import { generateDirectBillSchema } from "@/lib/validation/directBill";
import { createCompletedSession, type TestTenant } from "../helpers/tenant";

/** A short unique suffix, so manual bill numbers never collide between tests. */
export const uniq = () => randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

/** Unwraps a service result that must have succeeded. */
export function ok<T extends object>(result: T | ServiceFailure): Exclude<T, ServiceFailure> {
  if ("error" in result) {
    throw new Error(`expected success but got ${result.code ?? "(no code)"}: ${result.error}`);
  }
  return result as Exclude<T, ServiceFailure>;
}

/** Unwraps a service result that must have FAILED. */
export function failed<T extends object>(result: T | ServiceFailure): ServiceFailure {
  if (!("error" in result)) throw new Error("expected a failure but the call succeeded");
  return result;
}

/** N completed, unbilled work sessions with the given hours (one per entry). */
export async function makeSessions(t: TestTenant, hours: number[]) {
  const sessions = [];
  for (const h of hours) sessions.push(await createCompletedSession(t, { totalHours: h }));
  return sessions;
}

type RawBill = Partial<z.input<typeof generateBillSchema>>;
type RawSummary = Partial<z.input<typeof generateSummaryBillSchema>>;
type RawDirect = Partial<z.input<typeof generateDirectBillSchema>>;

/** A work-session bill request, run through the real schema so defaults and
 * coercions are exactly what a route would hand the service. */
export function billInput(t: TestTenant, workSessionIds: string[], over: RawBill = {}) {
  return generateBillSchema.parse({
    customerId: t.customerId,
    workSessionIds,
    billDate: "2026-10-02",
    ratePerHour: 1000,
    billType: "NON_GST",
    ...over,
  });
}

export function summaryInput(t: TestTenant, over: RawSummary = {}) {
  return generateSummaryBillSchema.parse({
    customerId: t.customerId,
    billDate: "2026-10-02",
    billType: "NON_GST",
    items: [
      {
        excavatorId: t.excavatorId,
        siteName: "Summary Site",
        fromDate: "2026-10-01",
        toDate: "2026-10-01",
        hours: 10,
        ratePerHour: 1000,
      },
    ],
    ...over,
  });
}

export function directInput(t: TestTenant, over: RawDirect = {}) {
  return generateDirectBillSchema.parse({
    customerId: t.customerId,
    excavatorId: t.excavatorId,
    billDate: "2026-10-02",
    fromDate: "2026-10-01",
    toDate: "2026-10-02",
    bucketHours: 10,
    bucketRate: 1000,
    billType: "NON_GST",
    ...over,
  });
}

export const idempotencyKey = () => `test-${randomUUID()}`;
