import { createHash } from "node:crypto";
import { trustedProxyHops } from "@/lib/config";
import { ApiHttpError } from "@/lib/api-error";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Database-backed sliding-window-counter rate limiter.
 *
 * Why the database: the previous limiter was an in-memory Map. On Render the
 * process restarts (deploys, free-tier spin-down) and can run as several
 * instances, so every restart/instance reset the counters — an attacker just
 * waited for one. Counters live in the RateLimitBucket table instead, so they
 * are shared by all instances and survive restarts. One atomic
 * `INSERT … ON CONFLICT DO UPDATE` per check; no external service (Redis) is
 * needed for the request volumes of this product.
 *
 * Algorithm (sliding window counter): requests are counted in fixed windows of
 * `windowMs`; the effective count is
 *     current window count + previous window count × (1 − elapsed/windowMs)
 * which smooths the boundary burst a plain fixed window allows.
 *
 * Failed attempts count too (the counter is incremented before the check), so
 * hammering a locked key does not shorten the lockout.
 */

export type RateRule = {
  /** Namespaced key, e.g. `login:ip:1.2.3.4`. Use hashPart() for identifiers. */
  key: string;
  limit: number;
  windowMs: number;
};

export type RateResult = { allowed: boolean; limit: number; remaining: number; retryAfterSec: number };

export async function consumeRateLimit(rule: RateRule): Promise<RateResult> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / rule.windowMs) * rule.windowMs);
  const prevStart = new Date(windowStart.getTime() - rule.windowMs);

  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count")
    VALUES (${rule.key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;
  const current = Number(rows[0]?.count ?? 1);

  const prevRows = await db.$queryRaw<{ count: number }[]>`
    SELECT "count" FROM "RateLimitBucket" WHERE "key" = ${rule.key} AND "windowStart" = ${prevStart}`;
  const previous = Number(prevRows[0]?.count ?? 0);

  const elapsedFraction = (now - windowStart.getTime()) / rule.windowMs;
  const effective = current + previous * (1 - elapsedFraction);
  const allowed = effective <= rule.limit;
  const retryAfterSec = Math.max(1, Math.ceil((windowStart.getTime() + rule.windowMs - now) / 1000));

  // Opportunistic cleanup (≈1% of calls): drop buckets older than two days.
  if (Math.random() < 0.01) {
    db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "windowStart" < ${new Date(now - 2 * 24 * 3600 * 1000)}`.catch(
      (err: unknown) => logger.warn("rate-limit cleanup failed", { error: String(err) }),
    );
  }

  return { allowed, limit: rule.limit, remaining: Math.max(0, Math.floor(rule.limit - effective)), retryAfterSec };
}

/** Consumes every rule; throws a 429 ApiHttpError (with Retry-After) as soon as
 * any one of them is exhausted. Use with withApi(). */
export async function enforceRateLimits(rules: RateRule[], message = "Too many attempts. Please wait a while and try again.") {
  let worst: RateResult | null = null;
  for (const rule of rules) {
    const result = await consumeRateLimit(rule);
    if (!result.allowed && (!worst || result.retryAfterSec > worst.retryAfterSec)) worst = result;
  }
  if (worst) {
    throw new ApiHttpError("RATE_LIMITED", message, {
      headers: { "Retry-After": String(worst.retryAfterSec) },
      details: { retryAfterSec: worst.retryAfterSec },
    });
  }
}

/** Short stable digest of an identifier (email, mobile…) so rate-limit rows
 * never store personal data in the clear and key length is bounded. */
export function hashPart(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 24);
}

/**
 * Best-effort client IP that an attacker cannot choose.
 *
 * X-Forwarded-For is "client-supplied…, proxy1-saw, proxy2-saw": every entry
 * except the ones appended by OUR proxies is attacker-controlled. We therefore
 * count `TRUSTED_PROXY_HOPS` entries from the RIGHT, never the first. With no
 * X-Forwarded-For (direct connection / local dev) the result is "unknown" —
 * which is why login limits are ALSO keyed by account, not only by IP.
 */
export function clientIp(req: Request): string {
  const hops = trustedProxyHops();
  const header = req.headers.get("x-forwarded-for");
  if (header && hops > 0) {
    const parts = header.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[Math.max(0, parts.length - hops)] ?? "unknown";
  }
  // No trusted proxy header: do NOT fall back to other client-settable headers
  // (X-Real-IP, True-Client-IP…). Callers also key limits by account.
  return "unknown";
}
