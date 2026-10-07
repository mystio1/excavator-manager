import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// auth() is the NextAuth JWT decoder; the tests hand the session guards whatever
// "cookie" they want to exercise (stale version, deleted user, ...).
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: authMock }));

import { requireBusinessApi, requireOperatorApi } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getValidBusinessSession, getValidOperatorSession } from "@/lib/session";
import { signOutEverywhere } from "@/lib/services/auth";
import { createSupportSession, revokeSupportToken } from "@/lib/supportTokens";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";

type FakeSession = {
  user: {
    id: string;
    businessId: string;
    role: string;
    tokenVersion?: number;
    supportSessionId?: string;
  };
};

const ownerSession = (over: Partial<FakeSession["user"]> = {}): FakeSession => ({
  user: { id: t.userId, businessId: t.businessId, role: "OWNER", tokenVersion: 0, ...over },
});
const operatorSession = (over: Partial<FakeSession["user"]> = {}): FakeSession => ({
  user: { id: t.operatorId, businessId: t.businessId, role: "OPERATOR", tokenVersion: 0, ...over },
});

let t: TestTenant;
let other: TestTenant;
const supportIds: string[] = [];

beforeAll(async () => {
  t = await createTenant("session");
  other = await createTenant("session-other");
  await db.operator.update({ where: { id: t.operatorId }, data: { canLogin: true, pinHash: "x" } });
});

afterAll(async () => {
  await db.supportSession.deleteMany({ where: { id: { in: supportIds } } });
  await cleanupTenant(t.businessId);
  await cleanupTenant(other.businessId);
});

beforeEach(async () => {
  authMock.mockReset();
  await db.business.update({ where: { id: t.businessId }, data: { frozen: false } });
  await db.user.update({ where: { id: t.userId }, data: { tokenVersion: 0 } });
  await db.operator.update({ where: { id: t.operatorId }, data: { tokenVersion: 0, canLogin: true, isArchived: false } });
});

describe("sign out everywhere", () => {
  it("invalidates every session issued before it and leaves an audit entry", async () => {
    authMock.mockResolvedValue(ownerSession({ tokenVersion: 0 }));
    expect(await getValidBusinessSession()).not.toBeNull();

    const result = await signOutEverywhere(t.userId, t.businessId);
    expect(result.tokenVersion).toBe(1);

    // The "other device" still presents the cookie it was issued (version 0).
    authMock.mockResolvedValue(ownerSession({ tokenVersion: 0 }));
    expect(await getValidBusinessSession()).toBeNull();
    // A cookie minted after the revocation (version 1) works again.
    authMock.mockResolvedValue(ownerSession({ tokenVersion: 1 }));
    expect(await getValidBusinessSession()).not.toBeNull();

    const audit = await db.auditLog.findFirst({ where: { businessId: t.businessId, action: "auth.signOutEverywhere" } });
    expect(audit).toMatchObject({ entityType: "User", entityId: t.userId, actorType: "OWNER" });
  });
});

describe("getValidBusinessSession", () => {
  it("accepts a session whose tokenVersion matches the database", async () => {
    authMock.mockResolvedValue(ownerSession({ tokenVersion: 0 }));
    const valid = await getValidBusinessSession();
    expect(valid).toMatchObject({ userId: t.userId, businessId: t.businessId, businessFrozen: false, supportSessionId: null });
  });

  it("returns null when there is no session at all", async () => {
    authMock.mockResolvedValue(null);
    expect(await getValidBusinessSession()).toBeNull();
  });

  it("rejects a token whose tokenVersion is stale (password reset / change revokes every session)", async () => {
    await db.user.update({ where: { id: t.userId }, data: { tokenVersion: { increment: 1 } } });
    authMock.mockResolvedValue(ownerSession({ tokenVersion: 0 }));
    expect(await getValidBusinessSession()).toBeNull();

    // A session minted after the bump (new version) is fine.
    authMock.mockResolvedValue(ownerSession({ tokenVersion: 1 }));
    expect(await getValidBusinessSession()).not.toBeNull();
  });

  it("treats a legacy token with no tokenVersion as version 0: valid until the first revocation", async () => {
    authMock.mockResolvedValue(ownerSession({ tokenVersion: undefined }));
    expect(await getValidBusinessSession()).not.toBeNull();

    await db.user.update({ where: { id: t.userId }, data: { tokenVersion: 1 } });
    expect(await getValidBusinessSession()).toBeNull();
  });

  it("rejects a token from the future (version higher than the database)", async () => {
    authMock.mockResolvedValue(ownerSession({ tokenVersion: 5 }));
    expect(await getValidBusinessSession()).toBeNull();
  });

  it("rejects a session whose user no longer exists", async () => {
    authMock.mockResolvedValue(ownerSession({ id: "does-not-exist-user" }));
    expect(await getValidBusinessSession()).toBeNull();
  });

  it("rejects a session naming a business the user does not belong to", async () => {
    authMock.mockResolvedValue(ownerSession({ businessId: other.businessId }));
    expect(await getValidBusinessSession()).toBeNull();
  });

  it("never accepts an operator-portal session for the owner app", async () => {
    authMock.mockResolvedValue(operatorSession());
    expect(await getValidBusinessSession()).toBeNull();
  });

  it("an impersonation session ends when its support session is revoked", async () => {
    const support = await createSupportSession();
    supportIds.push(support.id);
    authMock.mockResolvedValue(ownerSession({ supportSessionId: support.id }));
    expect(await getValidBusinessSession()).toMatchObject({ supportSessionId: support.id });

    await revokeSupportToken(support.token);
    expect(await getValidBusinessSession()).toBeNull();
  });

  it("an impersonation session ends when its support session expires", async () => {
    const support = await createSupportSession(new Date(Date.now() - 2 * 60 * 60 * 1000));
    supportIds.push(support.id);
    authMock.mockResolvedValue(ownerSession({ supportSessionId: support.id }));
    expect(await getValidBusinessSession()).toBeNull();
  });
});

describe("requireBusinessApi", () => {
  it("is ok for a valid session and returns the audit actor", async () => {
    authMock.mockResolvedValue(ownerSession());
    const result = await requireBusinessApi();
    expect(result.error).toBeNull();
    expect(result.session?.businessId).toBe(t.businessId);
    if (result.error === null) expect(result.actor).toMatchObject({ type: "OWNER", id: t.userId });
  });

  it("answers 401 UNAUTHORIZED for a stale or missing session", async () => {
    authMock.mockResolvedValue(null);
    const missing = await requireBusinessApi();
    expect(missing.error?.status).toBe(401);

    await db.user.update({ where: { id: t.userId }, data: { tokenVersion: 3 } });
    authMock.mockResolvedValue(ownerSession({ tokenVersion: 2 }));
    const stale = await requireBusinessApi();
    expect(stale.error?.status).toBe(401);
    expect(await stale.error?.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("answers 423 ACCOUNT_FROZEN once support froze the business (and 200-ok again after unfreezing)", async () => {
    authMock.mockResolvedValue(ownerSession());
    await db.business.update({ where: { id: t.businessId }, data: { frozen: true } });

    const frozen = await requireBusinessApi();
    expect(frozen.error?.status).toBe(423);
    const body = await frozen.error?.json();
    expect(body).toMatchObject({ code: "ACCOUNT_FROZEN" });
    expect(typeof body.error).toBe("string");

    // allowFrozen is for /api/layout only: it is how a frozen client learns it is frozen.
    const allowed = await requireBusinessApi({ allowFrozen: true });
    expect(allowed.error).toBeNull();

    await db.business.update({ where: { id: t.businessId }, data: { frozen: false } });
    expect((await requireBusinessApi()).error).toBeNull();
  });
});

describe("getValidOperatorSession / requireOperatorApi", () => {
  it("accepts a matching operator session", async () => {
    authMock.mockResolvedValue(operatorSession());
    expect(await getValidOperatorSession()).toMatchObject({ operatorId: t.operatorId, businessId: t.businessId });
    const api = await requireOperatorApi();
    expect(api.error).toBeNull();
  });

  it("rejects a stale operator tokenVersion (a PIN change signs out older sessions)", async () => {
    await db.operator.update({ where: { id: t.operatorId }, data: { tokenVersion: { increment: 1 } } });
    authMock.mockResolvedValue(operatorSession({ tokenVersion: 0 }));
    expect(await getValidOperatorSession()).toBeNull();

    authMock.mockResolvedValue(operatorSession({ tokenVersion: 1 }));
    expect(await getValidOperatorSession()).not.toBeNull();
  });

  it("rejects a deleted/unknown operator, a disabled login and an archived operator", async () => {
    authMock.mockResolvedValue(operatorSession({ id: "no-such-operator" }));
    expect(await getValidOperatorSession()).toBeNull();

    authMock.mockResolvedValue(operatorSession());
    await db.operator.update({ where: { id: t.operatorId }, data: { canLogin: false } });
    expect(await getValidOperatorSession()).toBeNull();

    await db.operator.update({ where: { id: t.operatorId }, data: { canLogin: true, isArchived: true } });
    expect(await getValidOperatorSession()).toBeNull();
  });

  it("never accepts an owner session for the operator portal, nor another business's id", async () => {
    authMock.mockResolvedValue(ownerSession());
    expect(await getValidOperatorSession()).toBeNull();

    authMock.mockResolvedValue(operatorSession({ businessId: other.businessId }));
    expect(await getValidOperatorSession()).toBeNull();
  });

  it("answers 423 ACCOUNT_FROZEN for operators of a frozen business", async () => {
    authMock.mockResolvedValue(operatorSession());
    await db.business.update({ where: { id: t.businessId }, data: { frozen: true } });
    const api = await requireOperatorApi();
    expect(api.error?.status).toBe(423);
    expect(await api.error?.json()).toMatchObject({ code: "ACCOUNT_FROZEN" });
  });
});
