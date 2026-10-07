import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fail } from "@/lib/api-error";

/** A Prisma transaction client. Services that can run standalone OR inside a
 * caller's transaction (idempotent creates) accept `tx?: Tx`. */
export type Tx = Prisma.TransactionClient;

const TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 } as const;

/** Runs `fn` inside the caller's transaction when one is given, otherwise opens
 * a new one. */
export function withTx<T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return tx ? fn(tx) : db.$transaction(fn, TX_OPTIONS);
}

/** Row locks (SELECT … FOR UPDATE) used to serialize concurrent writers of the
 * same financial record. Always take the lock BEFORE reading the values the
 * decision depends on. Table names are fixed literals (never user input). */
export async function lockBill(tx: Tx, billId: string) {
  await tx.$queryRaw`SELECT 1 FROM "Bill" WHERE "id" = ${billId} FOR UPDATE`;
}
export async function lockWorkSession(tx: Tx, workSessionId: string) {
  await tx.$queryRaw`SELECT 1 FROM "WorkSession" WHERE "id" = ${workSessionId} FOR UPDATE`;
}
/** Serializes writers of per-business singleton state (machine ordering, freeze/limits). */
export async function lockBusiness(tx: Tx, businessId: string) {
  await tx.$queryRaw`SELECT 1 FROM "Business" WHERE "id" = ${businessId} FOR UPDATE`;
}

/** Optimistic concurrency: the client sends the `version` it loaded. If the row
 * has moved on, refuse instead of silently overwriting someone else's change.
 * `expected === undefined` (older clients) skips the check. */
export function isStale(current: number, expected: number | undefined | null): boolean {
  return expected !== undefined && expected !== null && expected !== current;
}

export const resourceModified = (entity: string) =>
  fail("RESOURCE_MODIFIED", `This ${entity} was changed by someone else since you opened it. Reload and try again.`);
