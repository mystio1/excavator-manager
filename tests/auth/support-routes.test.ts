import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// signIn() needs a Next request scope; mocked. next-auth itself cannot be loaded by
// Vitest (it imports "next/server" without an extension) and the routes only need its
// error classes.
const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  auth: vi.fn(),
  /** Stands in for the limiter on the support login's rule set only (see below). */
  supportThrottle: vi.fn(),
  refund: vi.fn(async () => {}),
}));
const { AuthError } = vi.hoisted(() => {
  class AuthError extends Error {
    code: string = "error";
  }
  return { AuthError };
});
vi.mock("next-auth", () => ({ AuthError }));
vi.mock("@/lib/auth", () => ({ signIn: mocks.signIn, auth: mocks.auth }));

// The support login's rule set includes ONE platform-wide counter (`support-login:global`,
// 30 failed/day). A test must not burn the real one, so that single call is intercepted; every
// other limiter in this file is the real DB-backed one.
vi.mock("@/lib/auth-throttle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-throttle")>();
  return {
    ...actual,
    enforceAuthLimits: vi.fn(async (rules: Parameters<typeof actual.enforceAuthLimits>[0]) =>
      rules.some((r) => r.key === "support-login:global") ? mocks.supportThrottle(rules) : actual.enforceAuthLimits(rules),
    ),
  };
});

import { POST as clearDataPOST } from "@/app/api/support/clear-data/route";
import { GET as businessesGET } from "@/app/api/support/businesses/route";
import { POST as freezePOST } from "@/app/api/support/freeze/route";
import { POST as impersonatePOST } from "@/app/api/support/impersonate/route";
import { POST as limitsPOST } from "@/app/api/support/limits/route";
import { POST as loginPOST } from "@/app/api/support/login/route";
import { POST as logoutPOST } from "@/app/api/support/logout/route";
import { rateLimitedError, supportLoginRules } from "@/lib/auth-throttle";
import { db } from "@/lib/db";
import { createSupportSession, hashSupportToken, verifySupportToken } from "@/lib/supportTokens";
import { cleanupTenant, createTenant, fakeRequest, type TestTenant } from "../helpers/tenant";

const PASSWORD = "support-password-for-tests";
const originalPassword = process.env.SUPPORT_ACCESS_PASSWORD;
const supportIds: string[] = [];
const ips: string[] = [];
let t: TestTenant;

const freshIp = () => {
  const ip = `192.0.2.${ips.length + 1}-${randomUUID().slice(0, 6)}`;
  ips.push(ip);
  return ip;
};
const call = (path: string, body: unknown, token?: string, ip = freshIp()) =>
  fakeRequest(`https://app.example.test${path}`, {
    body,
    headers: { "x-forwarded-for": `6.6.6.6, ${ip}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });

/** Does this token get past requireSupportApi? (A cheap route: an empty body is a 422 once authenticated.) */
const isAuthenticated = async (token: string) =>
  (await limitsPOST(call("/api/support/limits", {}, token), undefined)).status !== 401;

async function liveSession() {
  const s = await createSupportSession();
  supportIds.push(s.id);
  return s;
}

beforeAll(async () => {
  t = await createTenant("support-routes");
});

afterAll(async () => {
  if (originalPassword === undefined) delete process.env.SUPPORT_ACCESS_PASSWORD;
  else process.env.SUPPORT_ACCESS_PASSWORD = originalPassword;
  for (const ip of ips) await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${`%:${ip}`}`;
  await db.supportSession.deleteMany({ where: { id: { in: supportIds } } });
  await cleanupTenant(t.businessId);
});

beforeEach(() => {
  process.env.SUPPORT_ACCESS_PASSWORD = PASSWORD;
  mocks.signIn.mockReset();
  mocks.refund.mockClear();
  mocks.supportThrottle.mockReset();
  mocks.supportThrottle.mockResolvedValue({ allowed: true, refund: mocks.refund });
});

afterEach(async () => {
  await db.business.update({ where: { id: t.businessId }, data: { frozen: false, maxOperators: null, maxBillsPerDay: null } });
});

describe("POST /api/support/login", () => {
  it("is disabled (404) unless SUPPORT_ACCESS_PASSWORD is configured", async () => {
    delete process.env.SUPPORT_ACCESS_PASSWORD;
    const res = await loginPOST(call("/api/support/login", { password: "anything" }), undefined);
    expect(res.status).toBe(404);
    expect(mocks.supportThrottle).not.toHaveBeenCalled();
  });

  it("a wrong password is a 401 and is NOT refunded (it counts as a failed guess)", async () => {
    const res = await loginPOST(call("/api/support/login", { password: "wrong" }), undefined);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED", error: "Incorrect password" });
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it("the right password opens a DB-backed one-hour session and returns the token (response keys unchanged)", async () => {
    const before = Date.now();
    const res = await loginPOST(call("/api/support/login", { password: PASSWORD }), undefined);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["expiresAt", "token"]);
    expect(typeof body.token).toBe("string");

    const row = await db.supportSession.findUniqueOrThrow({ where: { tokenHash: hashSupportToken(body.token) } });
    supportIds.push(row.id);
    expect(row.revokedAt).toBeNull();
    expect(row.tokenHash).not.toBe(body.token);
    expect(row.expiresAt.getTime() - before).toBeGreaterThan(59 * 60_000);
    expect(row.expiresAt.getTime() - before).toBeLessThanOrEqual(61 * 60_000);
    expect(await verifySupportToken(body.token)).toBe(true);
    expect(mocks.refund).toHaveBeenCalledTimes(1); // a correct password is not a failed guess
  });

  it("is throttled with the strict rule set: 3/15min per IP (real client IP, not the spoofed prefix) + 30 failed/day global", async () => {
    mocks.supportThrottle.mockRejectedValue(rateLimitedError(600));
    const ip = freshIp();
    const res = await loginPOST(call("/api/support/login", { password: PASSWORD }, undefined, ip), undefined);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("600");
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED" });

    const rules = mocks.supportThrottle.mock.calls[0][0];
    expect(rules).toEqual(supportLoginRules(ip));
    expect(rules[0].key).toBe(`support-login:ip:${ip}`);
  });

  it("a throttled login never reveals whether the password was right (no session is created)", async () => {
    mocks.supportThrottle.mockRejectedValue(rateLimitedError(600));
    const count = await db.supportSession.count();
    const res = await loginPOST(call("/api/support/login", { password: PASSWORD }), undefined);
    expect(res.status).toBe(429);
    expect(await db.supportSession.count()).toBe(count);
  });

  it("validates the body (422)", async () => {
    const res = await loginPOST(call("/api/support/login", { nope: true }), undefined);
    expect(res.status).toBe(422);
  });
});

describe("support routes require a LIVE database-backed session", () => {
  it("401 without a token, with a bogus token, with a revoked token and with an expired one", async () => {
    const revoked = await liveSession();
    await db.supportSession.update({ where: { id: revoked.id }, data: { revokedAt: new Date() } });
    const expired = await createSupportSession(new Date(Date.now() - 3 * 60 * 60 * 1000));
    supportIds.push(expired.id);

    for (const token of [undefined, "bogus", revoked.token, expired.token]) {
      for (const [name, res] of [
        ["businesses", await businessesGET(call("/api/support/businesses", undefined, token), undefined)],
        ["freeze", await freezePOST(call("/api/support/freeze", { businessCode: t.businessCode, frozen: true }, token), undefined)],
        ["limits", await limitsPOST(call("/api/support/limits", { businessCode: t.businessCode }, token), undefined)],
        ["impersonate", await impersonatePOST(call("/api/support/impersonate", { businessCode: t.businessCode }, token), undefined)],
        ["clear-data", await clearDataPOST(call("/api/support/clear-data", { businessCode: t.businessCode, confirmCode: t.businessCode }, token), undefined)],
      ] as const) {
        expect(res.status, `${name} with ${token ?? "no token"}`).toBe(401);
      }
    }
    // Nothing happened to the business.
    const row = await db.business.findUniqueOrThrow({ where: { id: t.businessId } });
    expect(row.frozen).toBe(false);
    expect(await db.excavator.count({ where: { businessId: t.businessId } })).toBe(1);
  });

  it("an owner/NextAuth session is not a support session (the old shared-secret token no longer works)", async () => {
    // A token shaped like the previous `<base64 payload>.<hmac>` format.
    const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 3_600_000 })).toString("base64url");
    const res = await businessesGET(call("/api/support/businesses", undefined, `${payload}.abcdef`), undefined);
    expect(res.status).toBe(401);
  });
});

describe("support mutations are audited as SUPPORT in the target business", () => {
  it("freeze records the session, the reason and who did it; the business is then locked out", async () => {
    const session = await liveSession();
    const res = await freezePOST(
      call("/api/support/freeze", { businessCode: t.businessCode, frozen: true, reason: "chargeback" }, session.token),
      undefined,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).business.frozen).toBe(true);

    const row = await db.auditLog.findFirstOrThrow({ where: { businessId: t.businessId, action: "support.freeze" } });
    expect(row).toMatchObject({ actorType: "SUPPORT", reason: "chargeback", entityType: "Business" });
    expect(row.details).toMatchObject({ supportSessionId: session.id });
  });

  it("limits validates (422 for a bad number from the service is a 422 VALIDATION_FAILED) and audits a good change", async () => {
    const session = await liveSession();
    const bad = await limitsPOST(call("/api/support/limits", { businessCode: t.businessCode, maxOperators: "-3", reason: "test limits" }, session.token), undefined);
    expect(bad.status).toBe(422);

    const ok = await limitsPOST(
      call("/api/support/limits", { businessCode: t.businessCode, maxOperators: "4", maxBillsPerDay: null, reason: "raise cap" }, session.token),
      undefined,
    );
    expect(ok.status).toBe(200);
    const row = await db.auditLog.findFirstOrThrow({ where: { businessId: t.businessId, action: "support.setLimits" } });
    expect(row).toMatchObject({ actorType: "SUPPORT" });
    expect(row.after).toMatchObject({ maxOperators: 4 });
  });

  it("clear-data re-checks the typed confirmation server-side (400) and an unknown business is 404", async () => {
    const session = await liveSession();
    const mismatch = await clearDataPOST(
      call("/api/support/clear-data", { businessCode: t.businessCode, confirmCode: "WRONG", reason: "test wipe" }, session.token),
      undefined,
    );
    expect(mismatch.status).toBe(400);
    expect(await db.excavator.count({ where: { businessId: t.businessId } })).toBe(1);

    const missing = await clearDataPOST(
      call("/api/support/clear-data", { businessCode: "NOSUCHCODE999", confirmCode: "NOSUCHCODE999", reason: "test wipe" }, session.token),
      undefined,
    );
    expect(missing.status).toBe(404);
  });

  it("impersonate signs in through the provider with the token + owner id (never a bare userId); no owner = 404", async () => {
    mocks.signIn.mockResolvedValue("/dashboard");
    const session = await liveSession();
    const ok = await impersonatePOST(call("/api/support/impersonate", { businessCode: t.businessCode.toLowerCase(), reason: "  help with a bill  " }, session.token), undefined);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(mocks.signIn).toHaveBeenCalledWith("support-impersonate", {
      userId: t.userId,
      supportToken: session.token,
      reason: "help with a bill", // trimmed
      redirect: false,
    });

    mocks.signIn.mockRejectedValue(new AuthError("refused"));
    const refused = await impersonatePOST(call("/api/support/impersonate", { businessCode: t.businessCode, reason: "help with a bill" }, session.token), undefined);
    expect(refused.status).toBe(401);

    const unknown = await impersonatePOST(call("/api/support/impersonate", { businessCode: "NOSUCHCODE999", reason: "help with a bill" }, session.token), undefined);
    expect(unknown.status).toBe(404);
  });
});

describe("every support action on a business needs a written reason", () => {
  it("is refused (422) without one, or with a token-short one, and nothing happens", async () => {
    mocks.signIn.mockClear();
    const session = await liveSession();
    const before = await db.business.findUniqueOrThrow({ where: { id: t.businessId }, select: { frozen: true, maxOperators: true } });
    const calls = [
      (reason?: string) => freezePOST(call("/api/support/freeze", { businessCode: t.businessCode, frozen: true, reason }, session.token), undefined),
      (reason?: string) => limitsPOST(call("/api/support/limits", { businessCode: t.businessCode, maxOperators: "9", reason }, session.token), undefined),
      (reason?: string) => impersonatePOST(call("/api/support/impersonate", { businessCode: t.businessCode, reason }, session.token), undefined),
      (reason?: string) => clearDataPOST(call("/api/support/clear-data", { businessCode: t.businessCode, confirmCode: t.businessCode, reason }, session.token), undefined),
    ];
    for (const run of calls) {
      for (const reason of [undefined, "", "   ", "no", "x".repeat(501)]) {
        const res = await run(reason);
        expect(res.status, `reason ${JSON.stringify(reason)?.slice(0, 12)}`).toBe(422);
      }
    }
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(await db.excavator.count({ where: { businessId: t.businessId } })).toBe(1);
    expect(await db.business.findUniqueOrThrow({ where: { id: t.businessId }, select: { frozen: true, maxOperators: true } })).toEqual(before);
  });
});

describe("POST /api/support/logout", () => {
  it("revokes the session: the token stops working at once, and the call is idempotent", async () => {
    const session = await liveSession();
    expect(await isAuthenticated(session.token)).toBe(true);

    const out = await logoutPOST(call("/api/support/logout", {}, session.token), undefined);
    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ ok: true });

    expect(await verifySupportToken(session.token)).toBe(false);
    expect((await db.supportSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).not.toBeNull();
    expect(await isAuthenticated(session.token)).toBe(false);

    // Logging out twice, with an unknown token, or with no token is still { ok: true }.
    for (const token of [session.token, "unknown", undefined]) {
      const again = await logoutPOST(call("/api/support/logout", {}, token), undefined);
      expect(again.status).toBe(200);
      expect(await again.json()).toEqual({ ok: true });
    }
  });
});
