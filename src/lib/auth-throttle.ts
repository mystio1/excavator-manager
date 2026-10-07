import { ApiHttpError } from "@/lib/api-error";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { consumeRateLimit, hashPart, type RateRule } from "@/lib/rateLimit";

/**
 * Brute-force throttling for every credential check (owner password, operator
 * PIN, app-lock PIN, support password, password reset...).
 *
 * Built on the DB-backed limiter in rateLimit.ts. The rule sets live here, in
 * one place, so the numbers are reviewable and unit-testable:
 *
 *   - every attempt is counted BEFORE the secret is checked (so parallel
 *     guesses can't slip through a check-then-count gap), and attempts made
 *     while locked out keep counting (hammering never shortens a lockout);
 *   - a login that then turns out to be CORRECT is refunded, so the limits
 *     measure failed guesses, not usage — a user opening the app twenty times
 *     a day, or a whole site sharing one NAT address, is never blocked;
 *   - each secret is limited per source IP AND per account, because the IP
 *     alone is either spoofable or shared (see clientIp()).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** When no trustworthy client IP is available ("unknown": no proxy header, or
 * TRUSTED_PROXY_HOPS=0) every caller would share ONE bucket. Scale that bucket
 * up so it cannot lock out real users; the per-account rules still apply. */
const UNKNOWN_IP_FACTOR = 25;

function ipRule(prefix: string, ip: string, limit: number, windowMs: number): RateRule {
  return { key: `${prefix}:ip:${ip}`, limit: ip === "unknown" ? limit * UNKNOWN_IP_FACTOR : limit, windowMs };
}

export const ownerLoginRules = (ip: string, identifier: string): RateRule[] => [
  ipRule("login", ip, 20, 15 * MINUTE),
  { key: `login:acct:${hashPart(identifier)}`, limit: 8, windowMs: 15 * MINUTE },
  { key: `login:acct-day:${hashPart(identifier)}`, limit: 40, windowMs: DAY },
];

/** Operator PINs are only 4+ digits, so the per-account limits are tighter. */
export const operatorLoginRules = (ip: string, mobile: string): RateRule[] => [
  ipRule("op-login", ip, 20, 15 * MINUTE),
  { key: `op-login:acct:${hashPart(mobile)}`, limit: 5, windowMs: 15 * MINUTE },
  { key: `op-login:acct-day:${hashPart(mobile)}`, limit: 20, windowMs: DAY },
];

export const registerRules = (ip: string): RateRule[] => [ipRule("register", ip, 5, HOUR)];

export const forgotPasswordRules = (ip: string, email: string): RateRule[] => [
  ipRule("forgot", ip, 5, 15 * MINUTE),
  { key: `forgot:email:${hashPart(email)}`, limit: 3, windowMs: HOUR },
];

export const resetPasswordRules = (ip: string): RateRule[] => [ipRule("reset", ip, 10, 15 * MINUTE)];

/** One shared budget per user across every place the app-lock PIN is
 * checked (verify, change, disable) — they all guess against the same PIN, so
 * being blocked on one must not let an attacker move to another. A 4-digit PIN
 * has only 10,000 values: 5 per 5 minutes alone would allow ~1,400 guesses a
 * day, hence the daily cap. */
export const appPinRules = (userId: string): RateRule[] => [
  { key: `app-pin:${userId}`, limit: 5, windowMs: 5 * MINUTE },
  { key: `app-pin-day:${userId}`, limit: 20, windowMs: DAY },
];

/** Exports build a whole workbook in memory (the register is capped at 20,000 bills), so they are the
 * costliest authenticated GETs: bound them per business. Normal use (a few a day) never comes close. */
export const exportRules = (businessId: string): RateRule[] => [
  { key: `export:${businessId}`, limit: 20, windowMs: 10 * MINUTE },
  { key: `export-day:${businessId}`, limit: 200, windowMs: DAY },
];

export const changePasswordRules = (userId: string): RateRule[] => [
  { key: `pw-change:${userId}`, limit: 5, windowMs: 15 * MINUTE },
  { key: `pw-change-day:${userId}`, limit: 20, windowMs: DAY },
];

/** The support password unlocks every business on the platform, so it is the
 * strictest: 3 failures per 15 minutes per IP, plus a platform-wide daily cap
 * that holds even against an attacker rotating IP addresses. No unknown-IP
 * scaling here: failing closed is right for this credential. */
export const supportLoginRules = (ip: string): RateRule[] => [
  // ORDER MATTERS: evaluated with stopAtFirstBlock, so an IP that is already
  // blocked never counts against the platform-wide bucket (otherwise one
  // anonymous caller could drain it and lock the real support person out).
  { key: `support-login:ip:${ip}`, limit: 3, windowMs: 15 * MINUTE },
  // Failed attempts only (a correct login refunds its attempt). 30/day cannot
  // brute-force a strong password even across many IPs, yet takes ~10 IPs
  // (3 each) to exhaust rather than one.
  { key: "support-login:global", limit: 30, windowMs: DAY },
];

function waitPhrase(retryAfterSec: number): string {
  if (retryAfterSec <= 60) return "a minute";
  const minutes = Math.ceil(retryAfterSec / 60);
  if (minutes < 90) return `${minutes} minutes`;
  const hours = Math.ceil(retryAfterSec / 3600);
  return hours === 1 ? "an hour" : `${hours} hours`;
}

/** The text users see (old installed apps print `error` verbatim, so the wait
 * time is part of the sentence rather than only in the Retry-After header). */
export function throttleMessage(retryAfterSec: number): string {
  return `Too many attempts. Please try again in ${waitPhrase(retryAfterSec)}.`;
}

export function rateLimitedError(retryAfterSec: number) {
  return new ApiHttpError("RATE_LIMITED", throttleMessage(retryAfterSec), {
    headers: { "Retry-After": String(retryAfterSec) },
    details: { retryAfterSec },
  });
}

export type Throttle =
  | {
      allowed: true;
      /** Call once the secret turned out to be correct: gives the attempt back. */
      refund: () => Promise<void>;
    }
  | { allowed: false; retryAfterSec: number; message: string };

/** Consumes every rule (all of them, even after one is exhausted — same as
 * enforceRateLimits) unless `stopAtFirstBlock` is set. Returns a value instead of throwing so it can be used from
 * services and from NextAuth's authorize(), where an ApiHttpError would be
 * swallowed. */
export async function checkRateLimits(rules: RateRule[], opts?: { stopAtFirstBlock?: boolean }): Promise<Throttle> {
  const startedAt = Date.now();
  let retryAfterSec = 0;
  for (const rule of rules) {
    const result = await consumeRateLimit(rule);
    if (!result.allowed) {
      retryAfterSec = Math.max(retryAfterSec, result.retryAfterSec);
      // Later (broader) rules are not charged for a request an earlier rule already refused.
      if (opts?.stopAtFirstBlock) break;
    }
  }
  if (retryAfterSec > 0) return { allowed: false, retryAfterSec, message: throttleMessage(retryAfterSec) };
  return { allowed: true, refund: () => refundRateLimits(rules, startedAt) };
}

/** Route-side variant: throws the 429 (with Retry-After) for withApi() to render. */
export async function enforceAuthLimits(rules: RateRule[], opts?: { stopAtFirstBlock?: boolean }) {
  const throttle = await checkRateLimits(rules, opts);
  if (!throttle.allowed) throw rateLimitedError(throttle.retryAfterSec);
  return throttle;
}

/** Decrements the bucket each rule counted into (never below zero). Best
 * effort: failing to give an attempt back must never fail a successful login. */
async function refundRateLimits(rules: RateRule[], consumedAt: number) {
  try {
    await Promise.all(
      rules.map((rule) => {
        const windowStart = new Date(Math.floor(consumedAt / rule.windowMs) * rule.windowMs);
        return db.$executeRaw`UPDATE "RateLimitBucket" SET "count" = GREATEST("count" - 1, 0) WHERE "key" = ${rule.key} AND "windowStart" = ${windowStart}`;
      }),
    );
  } catch (err) {
    logger.warn("rate-limit refund failed", { error: String(err) });
  }
}
