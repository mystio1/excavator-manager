import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authenticateSupportImpersonation } from "@/lib/services/auth";
import {
  SUPPORT_SESSION_TTL_MS,
  bearerToken,
  createSupportSession,
  findActiveSupportSession,
  hashSupportToken,
  isSupportSessionActive,
  requireSupportApi,
  revokeSupportToken,
  verifySupportToken,
} from "@/lib/supportTokens";
import { cleanupTenant, createTenant, fakeRequest, type TestTenant } from "../helpers/tenant";

let t: TestTenant;
const created: string[] = [];

async function newSession(now?: Date) {
  const session = await createSupportSession(now);
  created.push(session.id);
  return session;
}

const withBearer = (token: string | null) =>
  fakeRequest("https://x.test/api/support/businesses", {
    method: "GET",
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });

beforeAll(async () => {
  t = await createTenant("support-sessions");
});

afterAll(async () => {
  await db.supportSession.deleteMany({ where: { id: { in: created } } });
  await cleanupTenant(t.businessId);
});

describe("support sessions (DB-backed opaque tokens)", () => {
  it("creates a random 32-byte token, stores only its sha256, and expires in one hour", async () => {
    const now = new Date();
    const session = await newSession(now);

    // 32 random bytes, base64url => 43 chars
    expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.expiresAt.getTime() - now.getTime()).toBe(SUPPORT_SESSION_TTL_MS);
    expect(SUPPORT_SESSION_TTL_MS).toBe(60 * 60 * 1000);

    const row = await db.supportSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(row.tokenHash).toBe(hashSupportToken(session.token));
    expect(row.tokenHash).not.toBe(session.token);
    expect(row.revokedAt).toBeNull();
    // The raw token is nowhere in the table.
    expect(await db.supportSession.count({ where: { tokenHash: session.token } })).toBe(0);
  });

  it("two sessions never share a token", async () => {
    const [a, b] = [await newSession(), await newSession()];
    expect(a.token).not.toBe(b.token);
  });

  it("verifies a live session and rejects unknown, empty and oversized tokens", async () => {
    const session = await newSession();
    expect(await verifySupportToken(session.token)).toBe(true);
    expect(await findActiveSupportSession(session.token)).toMatchObject({ id: session.id });
    expect(await isSupportSessionActive(session.id)).toBe(true);

    expect(await verifySupportToken("not-a-real-token")).toBe(false);
    expect(await verifySupportToken("")).toBe(false);
    expect(await verifySupportToken("x".repeat(600))).toBe(false);
    // The stored hash is not a usable credential.
    expect(await verifySupportToken(hashSupportToken(session.token))).toBe(false);
    expect(await isSupportSessionActive("no-such-id")).toBe(false);
  });

  it("rejects an expired session", async () => {
    const session = await newSession(new Date(Date.now() - SUPPORT_SESSION_TTL_MS - 60_000));
    expect(await verifySupportToken(session.token)).toBe(false);
    expect(await isSupportSessionActive(session.id)).toBe(false);
  });

  it("revoking kills the session at once; revoke is idempotent", async () => {
    const session = await newSession();
    expect(await revokeSupportToken(session.token)).toBe(true);
    expect(await verifySupportToken(session.token)).toBe(false);
    expect(await isSupportSessionActive(session.id)).toBe(false);
    expect(await revokeSupportToken(session.token)).toBe(false);
    expect(await revokeSupportToken("unknown-token")).toBe(false);
    expect(await revokeSupportToken("")).toBe(false);
  });

  it("a token cannot be forged from AUTH_SECRET alone (it is just a database lookup)", async () => {
    // The old HMAC token was `<payload>.<hmac(AUTH_SECRET)>`; nothing like that is accepted any more.
    const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 3_600_000 })).toString("base64url");
    expect(await verifySupportToken(`${payload}.deadbeef`)).toBe(false);
  });
});

describe("bearerToken / requireSupportApi", () => {
  it("extracts only a well-formed Bearer token", () => {
    expect(bearerToken(withBearer("abc"))).toBe("abc");
    expect(bearerToken(withBearer(null))).toBeNull();
    expect(bearerToken(new Request("https://x.test", { headers: { authorization: "Basic abc" } }))).toBeNull();
    expect(bearerToken(new Request("https://x.test", { headers: { authorization: "Bearer " } }))).toBeNull();
  });

  it("is ASYNC and lets a live session through, exposing the session id and the SUPPORT actor", async () => {
    const session = await newSession();
    const result = requireSupportApi(withBearer(session.token));
    expect(result).toBeInstanceOf(Promise);
    const auth = await result;
    expect(auth.error).toBeNull();
    if (auth.error === null) {
      expect(auth.session.id).toBe(session.id);
      expect(auth.token).toBe(session.token);
      expect(auth.actor).toMatchObject({ type: "SUPPORT" });
    }
  });

  it("answers 401 UNAUTHORIZED for no header, a bogus token, a revoked and an expired session", async () => {
    const revoked = await newSession();
    await revokeSupportToken(revoked.token);
    const expired = await newSession(new Date(Date.now() - 2 * SUPPORT_SESSION_TTL_MS));

    for (const token of [null, "bogus", revoked.token, expired.token]) {
      const auth = await requireSupportApi(withBearer(token));
      expect(auth.error?.status).toBe(401);
      expect(await auth.error?.json()).toMatchObject({ code: "UNAUTHORIZED" });
    }
  });
});

describe("support impersonation provider (authenticateSupportImpersonation)", () => {
  it("signs the owner in with a live support session, tied to it, and audits it in the target business", async () => {
    const session = await newSession();
    const user = await authenticateSupportImpersonation(t.userId, session.token, "  fixing a bill  ");
    expect(user).toMatchObject({
      id: t.userId,
      businessId: t.businessId,
      role: "OWNER",
      tokenVersion: 0,
      supportSessionId: session.id,
    });

    const audit = await db.auditLog.findFirstOrThrow({ where: { businessId: t.businessId, action: "support.impersonate" } });
    expect(audit).toMatchObject({ actorType: "SUPPORT", entityType: "User", entityId: t.userId, reason: "fixing a bill" });
    expect(audit.details).toMatchObject({ supportSessionId: session.id });
  });

  it("is impossible with just a userId: no token, a wrong token, a revoked or an expired session all fail", async () => {
    const before = await db.auditLog.count({ where: { businessId: t.businessId, action: "support.impersonate" } });

    const revoked = await newSession();
    await revokeSupportToken(revoked.token);
    const expired = await newSession(new Date(Date.now() - 2 * SUPPORT_SESSION_TTL_MS));

    for (const token of ["", "wrong-token", revoked.token, expired.token, hashSupportToken(revoked.token)]) {
      expect(await authenticateSupportImpersonation(t.userId, token, "valid reason")).toBeNull();
    }
    // An unknown user with a perfectly valid session is refused too.
    const live = await newSession();
    expect(await authenticateSupportImpersonation("no-such-user", live.token, "valid reason")).toBeNull();
    // A valid session and user, but no (or a too-short) written reason: refused, and nothing is audited.
    for (const reason of [undefined, "", "  ", "no"]) {
      expect(await authenticateSupportImpersonation(t.userId, live.token, reason)).toBeNull();
    }

    // None of the refusals left an audit entry behind.
    expect(await db.auditLog.count({ where: { businessId: t.businessId, action: "support.impersonate" } })).toBe(before);
  });
});
