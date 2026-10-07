import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { ApiHttpError, failureResponse, type ServiceFailure } from "@/lib/api-error";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Idempotent execution of a financial create (bill, summary bill, payment).
 *
 * Problem: the request succeeds on the server, the response is lost (timeout,
 * dropped connection, app killed), the client retries — and without protection
 * a second bill/payment is created.
 *
 * Contract: the client sends `Idempotency-Key: <random id>` (one per logical
 * submission, reused for retries). Then, for the same business + key:
 *   - first request  → runs, response is stored
 *   - same retry     → the STORED response is returned (header Idempotent-Replay: true)
 *   - same key, different payload/operation → 409 IDEMPOTENCY_KEY_REUSED
 *
 * Exactly-once without stale "in progress" rows: the key row is inserted in the
 * SAME database transaction as the resource it protects, guarded by the unique
 * index (businessId, key). A concurrent duplicate blocks on that index until
 * the first transaction commits, then replays its response; if the first one
 * rolls back, the second one simply runs. A crash can never leave a half-done
 * key behind. Failed attempts (business-rule errors) are rolled back and NOT
 * stored, so the client can fix the input and retry with the same key.
 *
 * Requests without the header still work (older installed Android apps do not
 * send it) — they just are not replay-protected.
 */

export const IDEMPOTENCY_HEADER = "idempotency-key";
const KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;
const TTL_MS = 48 * 60 * 60 * 1000;

export type IdempotentSuccess = {
  ok: true;
  /** HTTP status of the success response (201 for creates). */
  status: number;
  body: unknown;
  resourceType?: string;
  resourceId?: string;
};
export type IdempotentFailure = { ok: false; failure: ServiceFailure };

class Rollback extends Error {
  constructor(readonly failure: ServiceFailure) {
    super(failure.error);
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

export function hashRequest(operation: string, payload: unknown): string {
  return createHash("sha256").update(`${operation}\n${canonicalJson(payload)}`).digest("hex");
}

export async function runIdempotent(
  opts: {
    req: Request;
    businessId: string;
    actorId: string | null;
    /** e.g. "bill.create" | "bill.summary.create" | "payment.create" */
    operation: string;
    /** The validated request payload — hashed to detect key reuse with a different body. */
    payload: unknown;
  },
  work: (tx: Prisma.TransactionClient) => Promise<IdempotentSuccess | IdempotentFailure>,
): Promise<NextResponse> {
  const rawKey = opts.req.headers.get(IDEMPOTENCY_HEADER)?.trim() || null;
  if (rawKey && !KEY_RE.test(rawKey)) {
    throw new ApiHttpError("BAD_REQUEST", "Idempotency-Key must be 8–128 characters (letters, digits, - _ . :)");
  }
  const requestHash = hashRequest(opts.operation, opts.payload);

  try {
    return await db.$transaction(
      async (tx) => {
        if (rawKey) {
          // An expired key is "absent": clear it so the same key can be reused.
          await tx.$executeRaw`DELETE FROM "IdempotencyKey"
            WHERE "businessId" = ${opts.businessId} AND "key" = ${rawKey} AND "expiresAt" < ${new Date()}`;
          const inserted = await tx.$queryRaw<{ id: string }[]>`
            INSERT INTO "IdempotencyKey"
              ("id", "businessId", "key", "operation", "actorId", "requestHash", "responseStatus", "responseBody", "expiresAt")
            VALUES
              (${randomUUID()}, ${opts.businessId}, ${rawKey}, ${opts.operation}, ${opts.actorId}, ${requestHash},
               0, '{}'::jsonb, ${new Date(Date.now() + TTL_MS)})
            ON CONFLICT ("businessId", "key") DO NOTHING
            RETURNING "id"`;

          if (inserted.length === 0) {
            const existing = await tx.idempotencyKey.findUnique({
              where: { businessId_key: { businessId: opts.businessId, key: rawKey } },
            });
            if (!existing || existing.operation !== opts.operation || existing.requestHash !== requestHash) {
              throw new ApiHttpError(
                "IDEMPOTENCY_KEY_REUSED",
                "This Idempotency-Key was already used for a different request. Use a new key for a new submission.",
              );
            }
            return NextResponse.json(existing.responseBody, {
              status: existing.responseStatus,
              headers: { "Idempotent-Replay": "true" },
            });
          }
        }

        const result = await work(tx);
        if (!result.ok) throw new Rollback(result.failure);

        // Money in the body is Decimal → serialize to the exact JSON clients get.
        // The replay copy is slimmed: a created bill carries its frozen letterhead
        // (up to three images, ~1 MB), which no client reads from a create
        // response and which would otherwise be stored once per bill.
        const body = JSON.parse(JSON.stringify(result.body)) as Prisma.InputJsonValue;
        const stored = JSON.parse(JSON.stringify(body, (k, v) => (k === "letterhead" ? undefined : v))) as Prisma.InputJsonValue;
        if (rawKey) {
          await tx.idempotencyKey.update({
            where: { businessId_key: { businessId: opts.businessId, key: rawKey } },
            data: {
              responseStatus: result.status,
              responseBody: stored,
              resourceType: result.resourceType ?? null,
              resourceId: result.resourceId ?? null,
            },
          });
        }
        // The first response and any replay are byte-identical: both omit the letterhead.
        return NextResponse.json(stored, { status: result.status });
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (error instanceof Rollback) return failureResponse(error.failure);
    throw error;
  } finally {
    // Housekeeping (~1% of calls): drop expired keys so the table cannot grow forever.
    if (Math.random() < 0.01) {
      purgeExpiredIdempotencyKeys().catch((err: unknown) => logger.warn("idempotency purge failed", { error: String(err) }));
    }
  }
}

/** Opportunistic cleanup of expired keys; safe to call from any cron/health tick. */
export async function purgeExpiredIdempotencyKeys() {
  const { count } = await db.idempotencyKey.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}
