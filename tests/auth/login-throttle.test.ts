import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, verifyPasswordOrDummy } from "@/lib/password";
import { authenticateOperator, authenticateOwner, setAppPin, disableAppPin, verifyAppPin, PIN_RATE_LIMIT_MESSAGE } from "@/lib/services/auth";
import { cleanupTenant, createTenant, fakeRequest, type TestTenant } from "../helpers/tenant";

/**
 * The credential checks run inside NextAuth's authorize() — every way of
 * reaching a provider (the login routes AND the catch-all callback) goes through
 * these service functions, so they are exercised here directly, against the real
 * database, with throwaway accounts and unique spoofed client IPs.
 */

const PASSWORD = "correct-pass-1";
const PIN = "4321";

let t: TestTenant;
let email: string;
const ips: string[] = [];
const identifiers: string[] = [];

/** A request as the proxy would forward it: the last X-Forwarded-For entry is the real client. */
function req(ip: string, spoofed = "6.6.6.6") {
  return fakeRequest("https://x.test/api/auth/callback/credentials", { headers: { "x-forwarded-for": `${spoofed}, ${ip}` } });
}
function freshIp() {
  const ip = `203.0.113.${100 + ips.length}-${randomUUID().slice(0, 6)}`;
  ips.push(ip);
  return ip;
}

/** A throwaway owner account with a known password and its own (so unshared) rate-limit counters. */
async function withOwner<T>(fn: (owner: { email: string }) => Promise<T>): Promise<T> {
  const tenant = await createTenant("login-throttle-acct");
  try {
    const user = await db.user.findUniqueOrThrow({ where: { id: tenant.userId } });
    identifiers.push(user.email);
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(PASSWORD) } });
    return await fn({ email: user.email });
  } finally {
    await cleanupTenant(tenant.businessId);
  }
}

beforeAll(async () => {
  t = await createTenant("login-throttle");
  const user = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
  email = user.email;
  identifiers.push(email);
  await db.user.update({ where: { id: t.userId }, data: { passwordHash: await hashPassword(PASSWORD) } });
});

afterAll(async () => {
  // Remove every rate-limit counter this file created (keys embed the IP or the hashed identifier).
  for (const ip of ips) await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${`%:${ip}`}`;
  await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${`%${t.userId}%`}`;
  const { hashPart } = await import("@/lib/rateLimit");
  for (const id of identifiers) await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${`%:${hashPart(id)}`}`;
  await cleanupTenant(t.businessId);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.business.update({ where: { id: t.businessId }, data: { frozen: false } });
});

describe("owner login: no account enumeration", () => {
  it("a correct login returns the session user including its tokenVersion", async () => {
    const result = await authenticateOwner(email, PASSWORD, req(freshIp()));
    expect(result).toMatchObject({
      ok: true,
      user: { id: t.userId, businessId: t.businessId, role: "OWNER", tokenVersion: 0 },
    });
  });

  it("wrong password and unknown account produce the IDENTICAL result", async () => {
    const ip = freshIp();
    const unknownId = `nobody-${randomUUID()}@example.test`;
    identifiers.push(unknownId);
    const wrong = await authenticateOwner(email, "not-the-password-1", req(ip));
    const unknown = await authenticateOwner(unknownId, "not-the-password-1", req(ip));
    expect(wrong).toEqual({ ok: false, reason: "credentials" });
    expect(unknown).toEqual(wrong);
  });

  it("an unknown identifier still pays for a bcrypt comparison (no timing oracle)", async () => {
    const compare = vi.spyOn(bcrypt, "compare");
    const unknownId = `nobody-${randomUUID()}@example.test`;
    identifiers.push(unknownId);
    await authenticateOwner(unknownId, "whatever-123", req(freshIp()));
    expect(compare).toHaveBeenCalledTimes(1);
    // ...against a real bcrypt hash, i.e. at full cost.
    expect(String(compare.mock.calls[0][1])).toMatch(/^\$2[aby]\$10\$/);

    compare.mockClear();
    await authenticateOwner(email, "wrong-wrong-1", req(freshIp()));
    expect(compare).toHaveBeenCalledTimes(1);
  });

  it("verifyPasswordOrDummy is false for the dummy and spends real bcrypt time", async () => {
    const started = Date.now();
    expect(await verifyPasswordOrDummy("anything", null)).toBe(false);
    expect(await verifyPasswordOrDummy("anything", undefined)).toBe(false);
    // Two cost-10 comparisons cannot be instantaneous.
    expect(Date.now() - started).toBeGreaterThanOrEqual(20);
    expect(await verifyPasswordOrDummy(PASSWORD, await hashPassword(PASSWORD))).toBe(true);
  });

  it("a frozen business is revealed ONLY after the password verified (wrong password stays a generic failure)", async () => {
    await db.business.update({ where: { id: t.businessId }, data: { frozen: true } });
    const ip = freshIp();

    const wrong = await authenticateOwner(email, "wrong-password-1", req(ip));
    expect(wrong).toEqual({ ok: false, reason: "credentials" }); // does not say "frozen"

    const correct = await authenticateOwner(email, PASSWORD, req(ip));
    expect(correct).toEqual({ ok: false, reason: "account_frozen" });

    await db.business.update({ where: { id: t.businessId }, data: { frozen: false } });
    expect((await authenticateOwner(email, PASSWORD, req(ip))).ok).toBe(true);
  });

  it("identifiers are matched case-insensitively for email and by phone", async () => {
    expect((await authenticateOwner(`  ${email.toUpperCase()} `, PASSWORD, req(freshIp()))).ok).toBe(true);
    const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
    await db.user.update({ where: { id: t.userId }, data: { phone } });
    expect((await authenticateOwner(phone, PASSWORD, req(freshIp()))).ok).toBe(true);
  });
});

describe("owner login: throttling", () => {
  it("blocks the 9th attempt on one account (8/15min), even with the right password, with a retry time", async () => {
    await withOwner(async ({ email: acct }) => {
      // Different IPs each time so only the per-ACCOUNT rule can be what blocks.
      for (let i = 0; i < 8; i++) {
        expect(await authenticateOwner(acct, "wrong-password-1", req(freshIp()))).toEqual({ ok: false, reason: "credentials" });
      }
      const blocked = await authenticateOwner(acct, "wrong-password-1", req(freshIp()));
      expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });
      expect(blocked.ok === false && blocked.reason === "rate_limited" && blocked.retryAfterSec).toBeGreaterThanOrEqual(1);

      // Locked out: not even the correct password gets in until the window passes.
      expect(await authenticateOwner(acct, PASSWORD, req(freshIp()))).toMatchObject({ ok: false, reason: "rate_limited" });
    });
  });

  it("blocks one IP after 20 attempts in 15 minutes, and rotating the spoofed X-Forwarded-For prefix does not help", async () => {
    const ip = freshIp();
    for (let i = 0; i < 20; i++) {
      const unknownId = `nobody-${randomUUID()}@example.test`;
      identifiers.push(unknownId);
      const result = await authenticateOwner(unknownId, "wrong-password-1", req(ip, `10.0.0.${i}`));
      expect(result).toEqual({ ok: false, reason: "credentials" });
    }
    const blocked = await authenticateOwner(email, PASSWORD, req(ip, "10.9.9.9"));
    expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });

    // A different real IP is unaffected.
    expect((await authenticateOwner(email, PASSWORD, req(freshIp()))).ok).toBe(true);
  });

  it("a normal login is never blocked: repeated CORRECT logins do not consume the budget", async () => {
    await withOwner(async ({ email: acct }) => {
      const ip = freshIp();
      for (let i = 0; i < 12; i++) {
        expect((await authenticateOwner(acct, PASSWORD, req(ip))).ok).toBe(true);
      }
    });
  });

  it("failed attempts followed by a success: the success is allowed and refunded", async () => {
    await withOwner(async ({ email: acct }) => {
      const ip = freshIp();
      for (let i = 0; i < 4; i++) await authenticateOwner(acct, "wrong-password-1", req(ip));
      for (let i = 0; i < 6; i++) expect((await authenticateOwner(acct, PASSWORD, req(ip))).ok).toBe(true);
    });
  });
});

describe("operator login (4-digit PINs): tight per-mobile limits", () => {
  const mobile = `9${Math.floor(100000000 + Math.random() * 899999999)}`;

  beforeAll(async () => {
    identifiers.push(mobile);
    await db.operator.update({
      where: { id: t.operatorId },
      data: { mobile, canLogin: true, pinHash: await hashPassword(PIN) },
    });
  });

  it("signs in with the right PIN and carries the operator's tokenVersion", async () => {
    const result = await authenticateOperator(mobile, PIN, req(freshIp()));
    expect(result).toMatchObject({ ok: true, user: { id: t.operatorId, businessId: t.businessId, role: "OPERATOR", tokenVersion: 0 } });
  });

  it("wrong PIN, unknown mobile and a login-disabled operator all look the same", async () => {
    const ip = freshIp();
    const unknownMobile = `8${Math.floor(100000000 + Math.random() * 899999999)}`;
    identifiers.push(unknownMobile);
    const wrong = await authenticateOperator(mobile, "0000", req(ip));
    const unknown = await authenticateOperator(unknownMobile, "0000", req(ip));
    expect(wrong).toEqual({ ok: false, reason: "credentials" });
    expect(unknown).toEqual(wrong);

    await db.operator.update({ where: { id: t.operatorId }, data: { canLogin: false } });
    expect(await authenticateOperator(mobile, PIN, req(ip))).toEqual(wrong);
    await db.operator.update({ where: { id: t.operatorId }, data: { canLogin: true } });
  });

  it("an unknown mobile still pays for a bcrypt comparison", async () => {
    const compare = vi.spyOn(bcrypt, "compare");
    const unknownMobile = `8${Math.floor(100000000 + Math.random() * 899999999)}`;
    identifiers.push(unknownMobile);
    await authenticateOperator(unknownMobile, "1234", req(freshIp()));
    expect(compare).toHaveBeenCalledTimes(1);
  });

  it("blocks the 6th wrong PIN for one mobile (5/15min) even from different IPs, then even the right PIN", async () => {
    const targetMobile = `7${Math.floor(100000000 + Math.random() * 899999999)}`;
    identifiers.push(targetMobile);
    const outcomes: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await authenticateOperator(targetMobile, "9999", req(freshIp()));
      outcomes.push(r.ok ? "ok" : r.reason);
    }
    expect(outcomes).toEqual(["credentials", "credentials", "credentials", "credentials", "credentials", "rate_limited"]);

    await db.operator.update({ where: { id: t.operatorId }, data: { mobile: targetMobile } });
    expect(await authenticateOperator(targetMobile, PIN, req(freshIp()))).toMatchObject({ ok: false, reason: "rate_limited" });
    await db.operator.update({ where: { id: t.operatorId }, data: { mobile } });
  });
});

describe("app-lock PIN limiter (DB-backed): 5/5min per user + daily cap", () => {
  const APP_PIN = "2468";

  afterEach(async () => {
    await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${`%${t.userId}%`}`;
  });

  it("blocks the 6th wrong PIN with the long-standing message and a retry time; a correct PIN is refunded", async () => {
    expect(await setAppPin(t.userId, undefined, APP_PIN)).toEqual({ ok: true });

    // Unlocking the app many times a day never counts against the budget.
    for (let i = 0; i < 8; i++) expect(await verifyAppPin(t.userId, APP_PIN)).toEqual({ ok: true });

    for (let i = 0; i < 5; i++) expect(await verifyAppPin(t.userId, "0000")).toMatchObject({ code: "UNAUTHORIZED" });
    const blocked = await verifyAppPin(t.userId, "0000");
    expect(blocked).toMatchObject({ code: "RATE_LIMITED", error: PIN_RATE_LIMIT_MESSAGE });
    expect("retryAfterSec" in blocked && blocked.retryAfterSec).toBeGreaterThanOrEqual(1);

    // One shared budget: change/disable are blocked as well, so an attacker cannot move to another endpoint.
    expect(await disableAppPin(t.userId, "0000")).toMatchObject({ code: "RATE_LIMITED" });
    expect(await setAppPin(t.userId, "0000", "1357")).toMatchObject({ code: "RATE_LIMITED" });
    // Even the correct PIN is refused while locked out.
    expect(await verifyAppPin(t.userId, APP_PIN)).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("has a daily cap on top of the 5-minute window", async () => {
    // Reset, then burn the daily counter directly to just under its cap.
    const { appPinRules } = await import("@/lib/auth-throttle");
    const day = appPinRules(t.userId)[1];
    expect(day.windowMs).toBe(24 * 60 * 60 * 1000);
    const { consumeRateLimit } = await import("@/lib/rateLimit");
    for (let i = 0; i < day.limit; i++) await consumeRateLimit(day);

    // The 5-minute window is empty, yet the daily cap blocks — with a message that says how long.
    const blocked = await verifyAppPin(t.userId, APP_PIN);
    expect(blocked).toMatchObject({ code: "RATE_LIMITED" });
    expect("error" in blocked && blocked.error).toMatch(/too many attempts/i);
  });
});
