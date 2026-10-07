import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Vitest cannot load next-auth itself (it imports "next/server" without an extension), so the
// NextAuth() factory is replaced by one that just captures the configuration src/lib/auth.ts
// passes in. That is the part under test: the JWT/session callbacks and the three providers'
// authorize() functions — which are what every sign-in path (login routes AND the catch-all
// callback handler) ultimately runs.
type Authorize = (credentials: Record<string, unknown> | undefined, request: Request) => Promise<unknown>;
type Captured = {
  session?: { strategy?: string; maxAge?: number };
  secret?: string | string[];
  providers: { id: string; authorize: Authorize }[];
  callbacks: {
    jwt: (args: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    session: (args: { session: { user: Record<string, unknown> }; token: Record<string, unknown> }) => Promise<{ user: Record<string, unknown> }>;
  };
};
const captured = vi.hoisted(() => ({ config: null as unknown }));

vi.mock("next-auth", () => {
  class CredentialsSignin extends Error {
    code = "credentials";
  }
  return {
    default: (config: unknown) => {
      captured.config = config;
      return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
    },
    CredentialsSignin,
  };
});
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));

import "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { hashPart } from "@/lib/rateLimit";
import { createSupportSession, revokeSupportToken } from "@/lib/supportTokens";
import { cleanupTenant, createTenant, fakeRequest, type TestTenant } from "../helpers/tenant";

const config = () => captured.config as Captured;
const provider = (id: string) => {
  const found = config().providers.find((p) => p.id === id);
  if (!found) throw new Error(`provider ${id} not configured`);
  return found;
};
const request = (ip: string) => fakeRequest("https://x.test/api/auth/callback/credentials", { headers: { "x-forwarded-for": `6.6.6.6, ${ip}` } });

let t: TestTenant;
let email: string;
let mobile: string;
const ips: string[] = [];
const supportIds: string[] = [];
const freshIp = () => {
  const ip = `203.0.113.${ips.length + 1}-${randomUUID().slice(0, 6)}`;
  ips.push(ip);
  return ip;
};

beforeAll(async () => {
  t = await createTenant("auth-config");
  const user = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
  email = user.email;
  mobile = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
  await db.user.update({ where: { id: t.userId }, data: { passwordHash: await hashPassword("cfg-pass-123"), tokenVersion: 3 } });
  await db.operator.update({
    where: { id: t.operatorId },
    data: { mobile, canLogin: true, pinHash: await hashPassword("5678"), tokenVersion: 7 },
  });
});

afterAll(async () => {
  for (const ip of ips) await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${`%:${ip}`}`;
  for (const part of [email, mobile]) await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${`%:${hashPart(part)}`}`;
  await db.supportSession.deleteMany({ where: { id: { in: supportIds } } });
  await cleanupTenant(t.businessId);
});

describe("session secret wiring", () => {
  it("hands Auth.js the result of authSecrets() (the string today; [current, previous] during a rolling rotation)", async () => {
    // authSecrets() itself and the real JWT behaviour are tested in auth-secrets.test.ts; this proves auth.ts
    // actually passes it on, so deleting that line would silently turn a rolling rotation into a full sign-out.
    const { authSecrets } = await import("@/lib/auth-secrets");
    expect(config().secret).toEqual(authSecrets());
    expect(config().secret).toBe(process.env.AUTH_SECRET); // no AUTH_SECRET_PREVIOUS in the test environment
  });

  it("src/lib/auth.ts contains the wiring (guards against it being removed together with its test)", () => {
    const source = fs.readFileSync("src/lib/auth.ts", "utf8");
    expect(source).toMatch(/secret:\s*authSecrets\(\)/);
  });
});

describe("session lifetime", () => {
  it("is a JWT with an explicit 30-day maximum (the per-request DB check is what revokes early)", () => {
    expect(config().session).toEqual({ strategy: "jwt", maxAge: 30 * 24 * 60 * 60 });
  });
});

describe("jwt / session callbacks", () => {
  it("put tokenVersion (and the support session id) into the JWT at sign-in", async () => {
    const token = await config().callbacks.jwt({
      token: { sub: "u1" },
      user: { id: "u1", businessId: "b1", role: "OWNER", tokenVersion: 4, supportSessionId: "s1" },
    });
    expect(token).toMatchObject({ sub: "u1", businessId: "b1", role: "OWNER", tokenVersion: 4, supportSessionId: "s1" });
  });

  it("leave an existing token alone on later reads (no user object)", async () => {
    const existing = { sub: "u1", businessId: "b1", role: "OWNER", tokenVersion: 4 };
    expect(await config().callbacks.jwt({ token: { ...existing } })).toEqual(existing);
  });

  it("expose the version to the session; a legacy token without one reads as 0", async () => {
    const withVersion = await config().callbacks.session({
      session: { user: {} },
      token: { sub: "u1", businessId: "b1", role: "OWNER", tokenVersion: 4 },
    });
    expect(withVersion.user).toMatchObject({ id: "u1", businessId: "b1", role: "OWNER", tokenVersion: 4 });

    const legacy = await config().callbacks.session({ session: { user: {} }, token: { sub: "u1", businessId: "b1", role: "OWNER" } });
    expect(legacy.user).toMatchObject({ tokenVersion: 0 });
    expect(legacy.user.supportSessionId).toBeUndefined();

    const impersonated = await config().callbacks.session({
      session: { user: {} },
      token: { sub: "u1", businessId: "b1", role: "OWNER", tokenVersion: 0, supportSessionId: "s1" },
    });
    expect(impersonated.user).toMatchObject({ supportSessionId: "s1" });
  });
});

describe("credentials provider (owner)", () => {
  const owner = () => provider("credentials");

  it("returns the session user, including the CURRENT tokenVersion", async () => {
    const user = await owner().authorize({ identifier: email, password: "cfg-pass-123" }, request(freshIp()));
    expect(user).toMatchObject({ id: t.userId, businessId: t.businessId, role: "OWNER", tokenVersion: 3 });
  });

  it("returns null (plain credentials failure) for wrong password, unknown account and non-string input", async () => {
    const ip = freshIp();
    expect(await owner().authorize({ identifier: email, password: "wrong-pass-1" }, request(ip))).toBeNull();
    expect(await owner().authorize({ identifier: `ghost-${randomUUID()}@example.test`, password: "wrong-pass-1" }, request(ip))).toBeNull();
    expect(await owner().authorize({ identifier: email }, request(ip))).toBeNull();
    expect(await owner().authorize(undefined, request(ip))).toBeNull();
  });

  it("throws a rate_limited refusal (with retryAfterSec) once the account is locked out", async () => {
    const lockedOut = await createTenant("auth-config-lockout");
    try {
      const user = await db.user.findUniqueOrThrow({ where: { id: lockedOut.userId } });
      for (let i = 0; i < 8; i++) await owner().authorize({ identifier: user.email, password: "wrong-pass-1" }, request(freshIp()));
      const error = await owner()
        .authorize({ identifier: user.email, password: "wrong-pass-1" }, request(freshIp()))
        .then(
          () => null,
          (e: unknown) => e as { code?: string; retryAfterSec?: number },
        );
      expect(error).toMatchObject({ code: "rate_limited" });
      expect(error?.retryAfterSec).toBeGreaterThanOrEqual(1);
      await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${`%:${hashPart(user.email)}`}`;
    } finally {
      await cleanupTenant(lockedOut.businessId);
    }
  });

  it("throws account_frozen only after the password verified", async () => {
    await db.business.update({ where: { id: t.businessId }, data: { frozen: true } });
    try {
      const ip = freshIp();
      expect(await owner().authorize({ identifier: email, password: "wrong-pass-1" }, request(ip))).toBeNull();
      const error = await owner()
        .authorize({ identifier: email, password: "cfg-pass-123" }, request(ip))
        .then(
          () => null,
          (e: unknown) => e as { code?: string },
        );
      expect(error).toMatchObject({ code: "account_frozen" });
    } finally {
      await db.business.update({ where: { id: t.businessId }, data: { frozen: false } });
    }
  });
});

describe("operator provider", () => {
  const operator = () => provider("operator");

  it("returns the operator session user with the operator's tokenVersion; wrong PIN is null", async () => {
    const ip = freshIp();
    expect(await operator().authorize({ mobile, pin: "5678" }, request(ip))).toMatchObject({
      id: t.operatorId,
      businessId: t.businessId,
      role: "OPERATOR",
      tokenVersion: 7,
    });
    expect(await operator().authorize({ mobile, pin: "0000" }, request(ip))).toBeNull();
    expect(await operator().authorize({ mobile }, request(ip))).toBeNull();
  });
});

describe("support-impersonate provider", () => {
  const impersonate = () => provider("support-impersonate");

  it("signs the owner in only with a live support session token, tied to that session", async () => {
    const session = await createSupportSession();
    supportIds.push(session.id);
    const user = await impersonate().authorize({ userId: t.userId, supportToken: session.token, reason: "fixing a bill" }, request(freshIp()));
    expect(user).toMatchObject({ id: t.userId, businessId: t.businessId, tokenVersion: 3, supportSessionId: session.id });
  });

  it("refuses a LIVE support token that comes without a written reason (this provider is reachable through the Auth.js callback route)", async () => {
    const session = await createSupportSession();
    supportIds.push(session.id);
    const ip = freshIp();
    for (const reason of [undefined, "", "   ", "no", 123 as unknown as string]) {
      expect(await impersonate().authorize({ userId: t.userId, supportToken: session.token, reason }, request(ip))).toBeNull();
    }
  });

  it("is impossible with just a userId, or with a dead/forged token", async () => {
    const revoked = await createSupportSession();
    supportIds.push(revoked.id);
    await revokeSupportToken(revoked.token);
    const expired = await createSupportSession(new Date(Date.now() - 3 * 60 * 60 * 1000));
    supportIds.push(expired.id);

    const ip = freshIp();
    expect(await impersonate().authorize({ userId: t.userId }, request(ip))).toBeNull();
    expect(await impersonate().authorize({ userId: t.userId, supportToken: "" }, request(ip))).toBeNull();
    expect(await impersonate().authorize({ userId: t.userId, supportToken: "forged" }, request(ip))).toBeNull();
    expect(await impersonate().authorize({ userId: t.userId, supportToken: revoked.token, reason: "valid reason" }, request(ip))).toBeNull();
    expect(await impersonate().authorize({ userId: t.userId, supportToken: expired.token, reason: "valid reason" }, request(ip))).toBeNull();
    expect(await impersonate().authorize({ supportToken: revoked.token, reason: "valid reason" }, request(ip))).toBeNull();
    expect(await impersonate().authorize(undefined, request(ip))).toBeNull();
  });
});
