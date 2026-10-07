import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// NextAuth's signIn()/auth() need a live Next request scope (cookies(), headers()),
// so they are mocked; everything else — route handlers, validation, the DB-backed
// limiter, services — is the real thing.
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn<(to: string, url: string) => Promise<void>>(async () => {}),
}));
// next-auth cannot be loaded by Vitest (it imports "next/server" without an extension), and the
// routes only need its error classes: same names, same `instanceof AuthError` relationship.
const { AuthError, CredentialsSignin } = vi.hoisted(() => {
  class AuthError extends Error {
    code: string = "error";
  }
  class CredentialsSignin extends AuthError {
    constructor() {
      super("CredentialsSignin");
      this.code = "credentials";
    }
  }
  return { AuthError, CredentialsSignin };
});
vi.mock("next-auth", () => ({ AuthError, CredentialsSignin }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth, signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("@/lib/email", () => ({ sendPasswordResetEmail: mocks.sendPasswordResetEmail }));

import { POST as changePasswordPOST } from "@/app/api/auth/change-password/route";
import { POST as forgotPOST } from "@/app/api/auth/forgot-password/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { POST as operatorLoginPOST } from "@/app/api/auth/operator-login/route";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { POST as resetPOST } from "@/app/api/auth/reset-password/route";
import { POST as verifyPinPOST } from "@/app/api/auth/verify-pin/route";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { hashPart } from "@/lib/rateLimit";
import { requestPasswordReset, setAppPin } from "@/lib/services/auth";
import { createSupportSession } from "@/lib/supportTokens";
import { cleanupTenant, createTenant, fakeRequest, type TestTenant } from "../helpers/tenant";

const ips: string[] = [];
const hashed: string[] = [];
const userIds: string[] = [];
const registeredEmails: string[] = [];
const supportIds: string[] = [];

function freshIp() {
  const ip = `198.51.100.${ips.length + 1}-${randomUUID().slice(0, 6)}`;
  ips.push(ip);
  return ip;
}
/** A POST as the proxy forwards it: spoofed left-most entry, then the address our proxy saw. */
function post(url: string, body: unknown, ip: string = freshIp(), extra: Record<string, string> = {}) {
  return fakeRequest(`https://app.example.test${url}`, {
    body,
    headers: { "x-forwarded-for": `6.6.6.6, ${ip}`, ...extra },
  });
}
const rawPost = (url: string, raw: string) =>
  new Request(`https://app.example.test${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: raw });

/** What NextAuth's signIn() throws when authorize() refuses (see SignInRefused in lib/auth.ts). */
function refused(code: string, retryAfterSec?: number) {
  const error = new CredentialsSignin();
  error.code = code;
  return Object.assign(error, { retryAfterSec });
}

let t: TestTenant;

beforeAll(async () => {
  t = await createTenant("auth-routes");
  userIds.push(t.userId);
});

afterAll(async () => {
  await db.supportSession.deleteMany({ where: { id: { in: supportIds } } });
  for (const ip of ips) await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${`%:${ip}`}`;
  for (const part of hashed) await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${`%:${part}`}`;
  for (const id of userIds) await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${`%${id}%`}`;
  for (const email of registeredEmails) {
    const user = await db.user.findUnique({ where: { email } });
    if (user) await cleanupTenant(user.businessId);
  }
  await cleanupTenant(t.businessId);
});

beforeEach(async () => {
  // The reset/change-password tests bump tokenVersion; every test starts from a never-revoked account.
  await db.user.update({ where: { id: t.userId }, data: { tokenVersion: 0 } });
  mocks.auth.mockReset();
  mocks.signIn.mockReset();
  mocks.signOut.mockReset();
  mocks.sendPasswordResetEmail.mockClear();
});

afterEach(async () => {
  await db.business.update({ where: { id: t.businessId }, data: { frozen: false } });
});

describe("POST /api/auth/login", () => {
  it("success keeps the old response shape { ok: true } and signs in without redirecting", async () => {
    mocks.signIn.mockResolvedValue("/dashboard");
    const res = await loginPOST(post("/api/auth/login", { identifier: " Owner@Example.com ", password: "abc123" }), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", { identifier: "Owner@Example.com", password: "abc123", redirect: false });
  });

  it("login accepts an old, weak password (no policy on login)", async () => {
    mocks.signIn.mockResolvedValue("/dashboard");
    const res = await loginPOST(post("/api/auth/login", { identifier: "a@b.co", password: "123456" }), undefined);
    expect(res.status).toBe(200);
  });

  it("wrong password and unknown account are the SAME 401 with the same message", async () => {
    mocks.signIn.mockRejectedValue(new CredentialsSignin());
    const a = await loginPOST(post("/api/auth/login", { identifier: "real@example.com", password: "wrong-1" }), undefined);
    const b = await loginPOST(post("/api/auth/login", { identifier: "ghost@example.com", password: "wrong-1" }), undefined);
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    const [bodyA, bodyB] = [await a.json(), await b.json()];
    expect(bodyA).toMatchObject({ error: "Wrong email/phone or password", code: "UNAUTHORIZED" });
    // requestId and the RFC 9457 `instance` (which embeds it) are the only per-request parts.
    const sameness = (body: Record<string, unknown>) => ({ ...body, requestId: undefined, instance: undefined });
    expect(sameness(bodyB)).toEqual(sameness(bodyA));
  });

  it("a throttled sign-in is a 429 RATE_LIMITED with Retry-After and the wait in the (string) message", async () => {
    mocks.signIn.mockRejectedValue(refused("rate_limited", 125));
    const res = await loginPOST(post("/api/auth/login", { identifier: "a@b.co", password: "x" }), undefined);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("125");
    const body = await res.json();
    expect(body).toMatchObject({ code: "RATE_LIMITED", details: { retryAfterSec: 125 } });
    expect(typeof body.error).toBe("string");
    expect(body.error).toMatch(/try again in 3 minutes/i);
  });

  it("a frozen owner (password already verified) gets 423 with the legacy `frozen: true` flag", async () => {
    mocks.signIn.mockRejectedValue(refused("account_frozen"));
    const res = await loginPOST(post("/api/auth/login", { identifier: "a@b.co", password: "x" }), undefined);
    expect(res.status).toBe(423);
    const body = await res.json();
    expect(body).toMatchObject({ code: "ACCOUNT_FROZEN", frozen: true });
    expect(typeof body.error).toBe("string");
  });

  it("an unexpected failure is a generic 500, never a leak of the cause", async () => {
    mocks.signIn.mockRejectedValue(new Error("unexpected explosion at 10.0.0.5 inside the sign-in code"));
    const res = await loginPOST(post("/api/auth/login", { identifier: "a@b.co", password: "x" }), undefined);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/explosion|10\.0\.0\.5/);
  });

  it("an unreachable database during sign-in is a retryable 503 (never 'wrong password', never a leak of the cause)", async () => {
    mocks.signIn.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const res = await loginPOST(post("/api/auth/login", { identifier: "a@b.co", password: "x" }), undefined);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    const body = await res.json();
    expect(body.code).toBe("SERVICE_BUSY");
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
  });

  it("does not report success when Auth.js answers with its error page instead of throwing", async () => {
    mocks.signIn.mockResolvedValue("https://app.example.test/api/auth/error?error=Configuration");
    const res = await loginPOST(post("/api/auth/login", { identifier: "a@b.co", password: "x" }), undefined);
    expect(res.status).toBe(500);
  });

  it("validates the body (422) and rejects malformed JSON (400)", async () => {
    const empty = await loginPOST(post("/api/auth/login", { identifier: "", password: "" }), undefined);
    expect(empty.status).toBe(422);
    expect(await empty.json()).toMatchObject({ code: "VALIDATION_FAILED" });
    const bad = await loginPOST(rawPost("/api/auth/login", "{not json"), undefined);
    expect(bad.status).toBe(400);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/operator-login", () => {
  it("success, generic 401 and 429 with the operator wording", async () => {
    mocks.signIn.mockResolvedValue("/operator");
    const ok = await operatorLoginPOST(post("/api/auth/operator-login", { mobile: "9876543210", pin: "1234" }), undefined);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(mocks.signIn).toHaveBeenCalledWith("operator", { mobile: "9876543210", pin: "1234", redirect: false });

    mocks.signIn.mockRejectedValue(new CredentialsSignin());
    const wrong = await operatorLoginPOST(post("/api/auth/operator-login", { mobile: "9876543210", pin: "0000" }), undefined);
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toMatchObject({ error: "Wrong mobile number or PIN", code: "UNAUTHORIZED" });

    mocks.signIn.mockRejectedValue(refused("rate_limited", 840));
    const limited = await operatorLoginPOST(post("/api/auth/operator-login", { mobile: "9876543210", pin: "0000" }), undefined);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("840");
    expect((await limited.json()).error).toMatch(/14 minutes/);
  });

  it("a frozen business's operator gets 423 only after the PIN verified", async () => {
    mocks.signIn.mockRejectedValue(refused("account_frozen"));
    const res = await operatorLoginPOST(post("/api/auth/operator-login", { mobile: "9876543210", pin: "1234" }), undefined);
    expect(res.status).toBe(423);
    expect(await res.json()).toMatchObject({ code: "ACCOUNT_FROZEN", frozen: true });
  });
});

describe("POST /api/auth/forgot-password", () => {
  it("answers the same { submitted: true } for a registered and an unregistered email", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
    hashed.push(hashPart(user.email));
    const ghost = `ghost-${randomUUID()}@example.test`;
    hashed.push(hashPart(ghost));

    const known = await forgotPOST(post("/api/auth/forgot-password", { email: user.email }), undefined);
    const unknown = await forgotPOST(post("/api/auth/forgot-password", { email: ghost }), undefined);
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual({ submitted: true });
    expect(await unknown.json()).toEqual({ submitted: true });

    // The mail goes out after the response (and only for the registered address).
    await vi.waitFor(() => expect(mocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1));
    expect(mocks.sendPasswordResetEmail.mock.calls[0][0]).toBe(user.email);
    expect(mocks.sendPasswordResetEmail.mock.calls[0][1]).toMatch(/^https:\/\/app\.example\.test\/reset-password\?token=[0-9a-f]{64}$/);
  });

  it("a poisoned Host / X-Forwarded-Host header cannot change the emailed link", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
    hashed.push(hashPart(user.email));
    const res = await forgotPOST(
      post("/api/auth/forgot-password", { email: user.email }, freshIp(), {
        host: "evil.example",
        "x-forwarded-host": "evil.example",
        origin: "https://evil.example",
      }),
      undefined,
    );
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(mocks.sendPasswordResetEmail).toHaveBeenCalled());
    const url = mocks.sendPasswordResetEmail.mock.calls[0][1];
    expect(url).not.toMatch(/evil/);
    expect(url.startsWith("https://app.example.test/")).toBe(true);
  });

  it("limits one email to 3 requests an hour (429 + Retry-After) — and the response never says whether it exists", async () => {
    const email = `limit-${randomUUID()}@example.test`;
    hashed.push(hashPart(email));
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 4; i++) {
      last = await forgotPOST(post("/api/auth/forgot-password", { email }), undefined);
      statuses.push(last.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
    expect(await last?.json()).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("limits one IP to 5 requests per 15 minutes, whatever the email", async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const email = `ip-${randomUUID()}@example.test`;
      hashed.push(hashPart(email));
      statuses.push((await forgotPOST(post("/api/auth/forgot-password", { email }, ip), undefined)).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("validates the email (422)", async () => {
    const res = await forgotPOST(post("/api/auth/forgot-password", { email: "not-an-email" }), undefined);
    expect(res.status).toBe(422);
  });
});

describe("POST /api/auth/reset-password", () => {
  async function issueToken(): Promise<string> {
    mocks.sendPasswordResetEmail.mockClear();
    const user = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
    await requestPasswordReset(user.email);
    const url = new URL(mocks.sendPasswordResetEmail.mock.calls[0][1]);
    return url.searchParams.get("token") as string;
  }

  it("resets once: { ok: true }, new password works, the same link then fails with 400", async () => {
    const token = await issueToken();
    const ip = freshIp();
    const before = await db.user.findUniqueOrThrow({ where: { id: t.userId } });

    const ok = await resetPOST(post("/api/auth/reset-password", { token, password: "Brand-new-1", confirmPassword: "Brand-new-1" }, ip), undefined);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });

    const after = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    expect(await verifyPassword("Brand-new-1", after.passwordHash)).toBe(true);

    const replay = await resetPOST(post("/api/auth/reset-password", { token, password: "Another-pass-2", confirmPassword: "Another-pass-2" }, ip), undefined);
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ code: "BAD_REQUEST", error: expect.stringMatching(/invalid or has expired/i) });
  });

  it("enforces the password policy (422 with a friendly message) and mismatched confirmation", async () => {
    const token = await issueToken();
    const weak = await resetPOST(post("/api/auth/reset-password", { token, password: "short1", confirmPassword: "short1" }), undefined);
    expect(weak.status).toBe(422);
    const body = await weak.json();
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(typeof body.error).toBe("string");
    expect(JSON.stringify(body)).toMatch(/at least 8 characters/i);

    const mismatch = await resetPOST(post("/api/auth/reset-password", { token, password: "Brand-new-2", confirmPassword: "Different-2" }), undefined);
    expect(mismatch.status).toBe(422);
    expect(JSON.stringify(await mismatch.json())).toMatch(/don't match/i);
  });

  it("limits one IP to 10 attempts per 15 minutes (429 + Retry-After)", async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await resetPOST(post("/api/auth/reset-password", { token: "f".repeat(64), password: "Valid-pass-1", confirmPassword: "Valid-pass-1" }, ip), undefined);
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("POST /api/auth/register", () => {
  const body = (email: string, over: Record<string, unknown> = {}) => ({
    businessName: "TST Register Co",
    ownerName: "Reg Owner",
    phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    email,
    password: "Regist3r-pass",
    ...over,
  });

  it("rejects a weak password with 422 before anything is created", async () => {
    const email = `weak-${randomUUID()}@example.test`;
    const res = await registerPOST(post("/api/auth/register", body(email, { password: "abcdef" })), undefined);
    expect(res.status).toBe(422);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("creates the account (bcrypt-hashed), signs in, and a duplicate email is a 409", async () => {
    mocks.signIn.mockResolvedValue("/dashboard");
    const email = `reg-${randomUUID()}@example.test`;
    registeredEmails.push(email);

    const ip = freshIp();
    const ok = await registerPOST(post("/api/auth/register", body(email), ip), undefined);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });

    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user.tokenVersion).toBe(0);
    expect(await verifyPassword("Regist3r-pass", user.passwordHash)).toBe(true);
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", { identifier: email, password: "Regist3r-pass", redirect: false });

    const dup = await registerPOST(post("/api/auth/register", body(email), ip), undefined);
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ code: "CONFLICT" });
  });

  it("limits one IP to 5 registrations an hour (6th is 429 + Retry-After)", async () => {
    mocks.signIn.mockResolvedValue("/dashboard");
    const ip = freshIp();
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      const email = `rl-${randomUUID()}@example.test`;
      registeredEmails.push(email);
      last = await registerPOST(post("/api/auth/register", body(email), ip), undefined);
      statuses.push(last.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
    expect(await last?.json()).toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("POST /api/auth/verify-pin (app lock)", () => {
  const ownerSession = () => ({ user: { id: t.userId, businessId: t.businessId, role: "OWNER", tokenVersion: 0 } });

  it("401 without a session; a wrong PIN is 401, the 6th wrong PIN is 429 + Retry-After; the right PIN works while not locked out", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await verifyPinPOST(post("/api/auth/verify-pin", { pin: "1111" }), undefined)).status).toBe(401);

    mocks.auth.mockResolvedValue(ownerSession());
    expect(await setAppPin(t.userId, undefined, "2468")).toEqual({ ok: true });
    expect((await verifyPinPOST(post("/api/auth/verify-pin", { pin: "2468" }), undefined)).status).toBe(200);

    for (let i = 0; i < 5; i++) {
      const wrong = await verifyPinPOST(post("/api/auth/verify-pin", { pin: "0000" }), undefined);
      expect(wrong.status).toBe(401);
    }
    const limited = await verifyPinPOST(post("/api/auth/verify-pin", { pin: "0000" }), undefined);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    expect(await limited.json()).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("423 for a frozen business", async () => {
    mocks.auth.mockResolvedValue(ownerSession());
    await db.business.update({ where: { id: t.businessId }, data: { frozen: true } });
    const res = await verifyPinPOST(post("/api/auth/verify-pin", { pin: "2468" }), undefined);
    expect(res.status).toBe(423);
  });
});

describe("POST /api/auth/change-password", () => {
  const ownerSession = (over: Record<string, unknown> = {}) => ({
    user: { id: t.userId, businessId: t.businessId, role: "OWNER", tokenVersion: 0, ...over },
  });

  it("needs a session, refuses an impersonating support session, checks the current password and the policy", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await changePasswordPOST(post("/api/auth/change-password", { currentPassword: "a", newPassword: "Valid-pass-1" }), undefined)).status).toBe(401);

    // An impersonating support session is not the owner and must not set the owner password...
    const support = await createSupportSession();
    supportIds.push(support.id);
    mocks.auth.mockResolvedValue(ownerSession({ supportSessionId: support.id }));
    const impersonated = await changePasswordPOST(post("/api/auth/change-password", { currentPassword: "a", newPassword: "Valid-pass-1" }), undefined);
    expect(impersonated.status).toBe(403);
    expect(await impersonated.json()).toMatchObject({ code: "FORBIDDEN" });
    // ...and once that support session has ended the guard rejects it outright.
    await db.supportSession.update({ where: { id: support.id }, data: { revokedAt: new Date() } });
    expect((await changePasswordPOST(post("/api/auth/change-password", { currentPassword: "a", newPassword: "Valid-pass-1" }), undefined)).status).toBe(401);

    await db.user.update({ where: { id: t.userId }, data: { passwordHash: await hashPassword("current-pass-1"), tokenVersion: 0 } });
    mocks.auth.mockResolvedValue(ownerSession());
    const weak = await changePasswordPOST(post("/api/auth/change-password", { currentPassword: "current-pass-1", newPassword: "weak" }), undefined);
    expect(weak.status).toBe(422);
    const wrong = await changePasswordPOST(post("/api/auth/change-password", { currentPassword: "nope-nope-1", newPassword: "Valid-pass-1" }), undefined);
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toMatch(/current password is incorrect/i);
  });

  it("changes the password, bumps tokenVersion (signing out other devices) and re-signs this device in", async () => {
    await db.user.update({ where: { id: t.userId }, data: { passwordHash: await hashPassword("current-pass-1"), tokenVersion: 0 } });
    mocks.auth.mockResolvedValue(ownerSession());
    mocks.signIn.mockResolvedValue("/dashboard");

    const res = await changePasswordPOST(post("/api/auth/change-password", { currentPassword: "current-pass-1", newPassword: "Valid-pass-1" }), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const user = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
    expect(user.tokenVersion).toBe(1);
    expect(await verifyPassword("Valid-pass-1", user.passwordHash)).toBe(true);
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", { identifier: user.email, password: "Valid-pass-1", redirect: false });

    // The old cookie (version 0) is now dead for the owner API.
    expect((await verifyPinPOST(post("/api/auth/verify-pin", { pin: "2468" }), undefined)).status).toBe(401);
  });

  it("if the fresh sign-in cannot be issued the password is still changed and the client is told to re-authenticate", async () => {
    await db.user.update({ where: { id: t.userId }, data: { passwordHash: await hashPassword("current-pass-1"), tokenVersion: 0 } });
    mocks.auth.mockResolvedValue(ownerSession());
    mocks.signIn.mockRejectedValue(new CredentialsSignin());
    const res = await changePasswordPOST(post("/api/auth/change-password", { currentPassword: "current-pass-1", newPassword: "Valid-pass-2" }), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reauthRequired: true });
  });
});

describe("POST /api/auth/logout", () => {
  it("keeps its { ok: true } shape", async () => {
    mocks.signOut.mockResolvedValue({ redirect: "/login" });
    const res = await logoutPOST(post("/api/auth/logout", {}), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
  });
});
