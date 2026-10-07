import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { ApiHttpError } from "@/lib/api-error";
import {
  appPinRules,
  changePasswordRules,
  checkRateLimits,
  enforceAuthLimits,
  forgotPasswordRules,
  operatorLoginRules,
  ownerLoginRules,
  registerRules,
  resetPasswordRules,
  supportLoginRules,
  throttleMessage,
} from "@/lib/auth-throttle";
import { db } from "@/lib/db";
import { consumeRateLimit, enforceRateLimits, hashPart, type RateRule } from "@/lib/rateLimit";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Every key is namespaced with a per-run prefix so the test never touches real counters
// (and the support/global buckets are never consumed — see the rule-set test below).
const NS = `tst-${randomUUID().slice(0, 8)}`;
const key = (name: string) => `${NS}:${name}`;
const prefixed = (rules: RateRule[]): RateRule[] => rules.map((r) => ({ ...r, key: `${NS}:${r.key}` }));

afterAll(async () => {
  await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${NS + ":%"}`;
});

describe("sliding-window rate limiter (DB-backed)", () => {
  it("allows exactly `limit` hits and blocks the next one", async () => {
    const rule: RateRule = { key: key("block"), limit: 3, windowMs: HOUR };
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consumeRateLimit(rule));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[0].remaining).toBe(2);
    expect(results[2].remaining).toBe(0);
  });

  it("keeps blocking while hammered (attempts made while locked out still count)", async () => {
    const rule: RateRule = { key: key("hammer"), limit: 1, windowMs: HOUR };
    await consumeRateLimit(rule);
    for (let i = 0; i < 3; i++) expect((await consumeRateLimit(rule)).allowed).toBe(false);
  });

  it("reports a positive retryAfter that never exceeds the window", async () => {
    const rule: RateRule = { key: key("retry"), limit: 1, windowMs: 15 * MINUTE };
    await consumeRateLimit(rule);
    const blocked = await consumeRateLimit(rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(15 * 60);
  });

  it("counts different keys independently", async () => {
    const a: RateRule = { key: key("indep-a"), limit: 1, windowMs: HOUR };
    const b: RateRule = { key: key("indep-b"), limit: 1, windowMs: HOUR };
    await consumeRateLimit(a);
    expect((await consumeRateLimit(a)).allowed).toBe(false);
    expect((await consumeRateLimit(b)).allowed).toBe(true);
  });

  it("enforceRateLimits throws a 429 RATE_LIMITED with Retry-After once any rule is exhausted", async () => {
    const rules: RateRule[] = [
      { key: key("enf-ip"), limit: 100, windowMs: HOUR },
      { key: key("enf-acct"), limit: 2, windowMs: HOUR },
    ];
    await enforceRateLimits(rules);
    await enforceRateLimits(rules);
    const err = await enforceRateLimits(rules).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiHttpError);
    const http = err as ApiHttpError;
    expect(http.status).toBe(429);
    expect(http.code).toBe("RATE_LIMITED");
    expect(Number(http.headers?.["Retry-After"])).toBeGreaterThanOrEqual(1);
  });

  it("hashPart is stable, case/whitespace-insensitive and does not leak the identifier", () => {
    expect(hashPart("  Owner@Example.COM ")).toBe(hashPart("owner@example.com"));
    expect(hashPart("a@b.co")).not.toBe(hashPart("c@d.co"));
    expect(hashPart("owner@example.com")).not.toContain("owner");
  });
});

describe("auth throttle (checkRateLimits)", () => {
  it("blocks with a human message + retryAfter; a refund gives a correct login its attempt back", async () => {
    const rules: RateRule[] = [{ key: key("thr"), limit: 2, windowMs: HOUR }];

    // Two "correct" attempts, each refunded: the budget never runs out.
    for (let i = 0; i < 5; i++) {
      const t = await checkRateLimits(rules);
      expect(t.allowed).toBe(true);
      if (t.allowed) await t.refund();
    }

    // Two failed attempts use the budget up; the third is blocked.
    expect((await checkRateLimits(rules)).allowed).toBe(true);
    expect((await checkRateLimits(rules)).allowed).toBe(true);
    const blocked = await checkRateLimits(rules);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
      expect(blocked.message).toMatch(/too many attempts/i);
    }
  });

  it("enforceAuthLimits throws the 429 with Retry-After and the wait in the message", async () => {
    const rules: RateRule[] = [{ key: key("enf-auth"), limit: 1, windowMs: HOUR }];
    await enforceAuthLimits(rules);
    const err = await enforceAuthLimits(rules).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiHttpError);
    const http = err as ApiHttpError;
    expect(http.status).toBe(429);
    expect(http.headers?.["Retry-After"]).toBeDefined();
    expect(http.message).toMatch(/try again in/i);
    expect(http.details).toMatchObject({ retryAfterSec: Number(http.headers?.["Retry-After"]) });
  });

  it("throttleMessage phrases the wait sensibly", () => {
    expect(throttleMessage(30)).toMatch(/a minute/);
    expect(throttleMessage(10 * 60)).toMatch(/10 minutes/);
    expect(throttleMessage(3 * 3600)).toMatch(/3 hours/);
  });
});

describe("rule sets (the numbers the audit asked for)", () => {
  const find = (rules: RateRule[], part: string) => {
    const rule = rules.find((r) => r.key.includes(part));
    if (!rule) throw new Error(`no rule matching ${part}`);
    return rule;
  };

  it("owner login: ip 20/15min, account 8/15min + 40/24h", () => {
    const rules = ownerLoginRules("203.0.113.9", "Owner@Example.com");
    expect(rules).toHaveLength(3);
    expect(find(rules, ":ip:")).toMatchObject({ limit: 20, windowMs: 15 * MINUTE });
    expect(find(rules, ":acct:")).toMatchObject({ limit: 8, windowMs: 15 * MINUTE });
    expect(find(rules, ":acct-day:")).toMatchObject({ limit: 40, windowMs: DAY });
    // identifier is hashed, never stored in the key in the clear
    expect(rules.map((r) => r.key).join("|")).not.toMatch(/owner@example/i);
  });

  it("operator login (4-digit PINs): ip 20/15min, account 5/15min + 20/24h", () => {
    const rules = operatorLoginRules("203.0.113.9", "9876543210");
    expect(find(rules, ":ip:")).toMatchObject({ limit: 20, windowMs: 15 * MINUTE });
    expect(find(rules, ":acct:")).toMatchObject({ limit: 5, windowMs: 15 * MINUTE });
    expect(find(rules, ":acct-day:")).toMatchObject({ limit: 20, windowMs: DAY });
  });

  it("register ip 5/hour; forgot ip 5/15min + email 3/hour; reset ip 10/15min", () => {
    expect(registerRules("1.2.3.4")).toEqual([expect.objectContaining({ limit: 5, windowMs: HOUR })]);
    const forgot = forgotPasswordRules("1.2.3.4", "a@b.co");
    expect(find(forgot, ":ip:")).toMatchObject({ limit: 5, windowMs: 15 * MINUTE });
    expect(find(forgot, ":email:")).toMatchObject({ limit: 3, windowMs: HOUR });
    expect(resetPasswordRules("1.2.3.4")).toEqual([expect.objectContaining({ limit: 10, windowMs: 15 * MINUTE })]);
  });

  it("app-PIN keeps 5/5min and adds a daily cap; password change is limited too", () => {
    const pin = appPinRules("user1");
    expect(pin[0]).toMatchObject({ limit: 5, windowMs: 5 * MINUTE });
    expect(pin[1]).toMatchObject({ windowMs: DAY });
    expect(pin[1].limit).toBeGreaterThan(5);
    expect(changePasswordRules("user1").length).toBeGreaterThanOrEqual(2);
  });

  it("support login: 3/15min per IP + 30 failed/day platform-wide, IP rule evaluated first", () => {
    const rules = supportLoginRules("203.0.113.9");
    expect(rules[0]).toMatchObject({ limit: 3, windowMs: 15 * MINUTE });
    expect(rules[1]).toMatchObject({ key: "support-login:global", limit: 30, windowMs: DAY });
  });

  it("an unknown client IP gets a scaled-up bucket so it cannot lock everyone out; real IPs are not scaled", () => {
    const unknown = find(ownerLoginRules("unknown", "a@b.co"), ":ip:");
    const known = find(ownerLoginRules("203.0.113.9", "a@b.co"), ":ip:");
    expect(unknown.limit).toBeGreaterThan(known.limit);
    expect(known.limit).toBe(20);
  });

  it("the support rule set actually enforces 3 per IP (namespaced keys: real support counters untouched)", async () => {
    const rules = prefixed(supportLoginRules(`ip-${randomUUID().slice(0, 6)}`));
    // Rebuild without the 10/day global rule being the binding one: ip rule is hit first at 4.
    const outcomes: boolean[] = [];
    for (let i = 0; i < 4; i++) outcomes.push((await checkRateLimits(rules)).allowed);
    expect(outcomes).toEqual([true, true, true, false]);
  });

  it("an IP that is already blocked does NOT drain the platform-wide support bucket (stopAtFirstBlock)", async () => {
    const ip = `ip-${randomUUID().slice(0, 6)}`;
    // The global bucket key is the same for every IP, so give THIS test its own copy.
    const rules = prefixed(supportLoginRules(ip)).map((r, i) => (i === 1 ? { ...r, key: `${r.key}:${randomUUID().slice(0, 6)}` } : r));
    const globalKey = rules[1].key;
    // 10 attempts from ONE IP: 3 pass its rule, 7 are refused by it.
    for (let i = 0; i < 10; i++) await checkRateLimits(rules, { stopAtFirstBlock: true });
    const rows = await db.rateLimitBucket.findMany({ where: { key: globalKey } });
    const charged = rows.reduce((n, r) => n + r.count, 0);
    expect(charged).toBe(3); // only the attempts the IP rule let through reached the global bucket
  });

  it("without stopAtFirstBlock every rule is charged (per-account limits rely on that)", async () => {
    const ip = `ip-${randomUUID().slice(0, 6)}`;
    const rules = prefixed(supportLoginRules(ip)).map((r, i) => (i === 1 ? { ...r, key: `${r.key}:${randomUUID().slice(0, 6)}` } : r));
    for (let i = 0; i < 6; i++) await checkRateLimits(rules);
    const rows = await db.rateLimitBucket.findMany({ where: { key: rules[1].key } });
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(6);
  });

  it("the owner-login account limit blocks the 9th failed attempt but never a fresh account/IP", async () => {
    const identifier = `${randomUUID()}@example.test`;
    const rules = prefixed(ownerLoginRules("198.51.100.20", identifier));
    const outcomes: boolean[] = [];
    for (let i = 0; i < 9; i++) outcomes.push((await checkRateLimits(rules)).allowed);
    expect(outcomes.slice(0, 8).every(Boolean)).toBe(true);
    expect(outcomes[8]).toBe(false);

    // Same IP, different account: only the IP rule is shared (9 of 20 used).
    const other = prefixed(ownerLoginRules("198.51.100.20", `${randomUUID()}@example.test`));
    expect((await checkRateLimits(other)).allowed).toBe(true);
  });
});
