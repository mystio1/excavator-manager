import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The mail provider is mocked: no real email is ever sent from a test.
const sendPasswordResetEmail = vi.hoisted(() => vi.fn<(to: string, url: string) => Promise<void>>(async () => {}));
vi.mock("@/lib/email", () => ({ sendPasswordResetEmail }));

import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  changePassword,
  hashResetToken,
  INVALID_RESET_MESSAGE,
  requestPasswordReset,
  requestPasswordResetQuietly,
  resetPassword,
} from "@/lib/services/auth";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";

let t: TestTenant;
let email: string;
const OLD_PASSWORD = "old-password-1";

/** Runs a reset request and hands back the raw token that went into the emailed link. */
async function requestAndCaptureToken(): Promise<string> {
  sendPasswordResetEmail.mockClear();
  await requestPasswordReset(email);
  expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  const [, url] = sendPasswordResetEmail.mock.calls[0];
  const token = new URL(url).searchParams.get("token");
  expect(token).toBeTruthy();
  return token as string;
}

beforeAll(async () => {
  t = await createTenant("pwreset");
  const user = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
  email = user.email;
  await db.user.update({ where: { id: t.userId }, data: { passwordHash: await hashPassword(OLD_PASSWORD) } });
});

afterAll(async () => {
  await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${`%${t.userId}%`}`;
  await cleanupTenant(t.businessId);
});

beforeEach(async () => {
  sendPasswordResetEmail.mockClear();
  await db.user.update({
    where: { id: t.userId },
    data: { resetTokenHash: null, resetTokenExpiry: null, passwordHash: await hashPassword(OLD_PASSWORD) },
  });
});

describe("requestPasswordReset", () => {
  it("emails a link built from APP_URL, never from request headers", async () => {
    const token = await requestAndCaptureToken();
    const [to, url] = sendPasswordResetEmail.mock.calls[0];
    expect(to).toBe(email);
    expect(url).toBe(`https://app.example.test/reset-password?token=${token}`);
  });

  it("uses a 32-byte random token and stores only its sha256, expiring in one hour", async () => {
    const before = Date.now();
    const token = await requestAndCaptureToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex

    const row = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
    expect(row.resetTokenHash).toBe(hashResetToken(token));
    expect(row.resetTokenHash).not.toBe(token);
    const ttl = (row.resetTokenExpiry as Date).getTime() - before;
    expect(ttl).toBeGreaterThan(59 * 60_000);
    expect(ttl).toBeLessThanOrEqual(60 * 60_000 + 5_000);
  });

  it("each request replaces the previous token (one live token per user)", async () => {
    const first = await requestAndCaptureToken();
    const second = await requestAndCaptureToken();
    expect(second).not.toBe(first);
    expect(await resetPassword(first, "brand-new-pass1")).toMatchObject({ code: "BAD_REQUEST" });
    expect(await resetPassword(second, "brand-new-pass1")).toEqual({ ok: true });
  });

  it("is a silent no-op for an unknown email (nothing sent, nothing thrown)", async () => {
    await expect(requestPasswordReset("nobody-here@example.test")).resolves.toBeUndefined();
    await expect(requestPasswordResetQuietly("nobody-here@example.test")).resolves.toBeUndefined();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("the quiet variant swallows mail-provider failures", async () => {
    sendPasswordResetEmail.mockRejectedValueOnce(new Error("provider down"));
    await expect(requestPasswordResetQuietly(email)).resolves.toBeUndefined();
  });

  it("matches the email case-insensitively", async () => {
    await requestPasswordReset(email.toUpperCase());
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });
});

describe("resetPassword", () => {
  it("sets the new password, clears the token (single use) and bumps tokenVersion", async () => {
    const token = await requestAndCaptureToken();
    const before = await db.user.findUniqueOrThrow({ where: { id: t.userId } });

    expect(await resetPassword(token, "brand-new-pass1")).toEqual({ ok: true });

    const after = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
    expect(after.resetTokenHash).toBeNull();
    expect(after.resetTokenExpiry).toBeNull();
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    expect(await verifyPassword("brand-new-pass1", after.passwordHash)).toBe(true);
    expect(await verifyPassword(OLD_PASSWORD, after.passwordHash)).toBe(false);

    // Single use: the same token is now dead.
    const again = await resetPassword(token, "another-pass-2");
    expect(again).toMatchObject({ error: INVALID_RESET_MESSAGE, code: "BAD_REQUEST" });
    const stillNew = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
    expect(await verifyPassword("brand-new-pass1", stillNew.passwordHash)).toBe(true);
  });

  it("two concurrent requests with one token: exactly one wins", async () => {
    const token = await requestAndCaptureToken();
    const before = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
    const results = await Promise.all([resetPassword(token, "winner-pass-1"), resetPassword(token, "winner-pass-2")]);
    expect(results.filter((r) => "ok" in r)).toHaveLength(1);
    expect(results.filter((r) => "error" in r)).toHaveLength(1);
    const after = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
    expect(after.tokenVersion).toBe(before.tokenVersion + 1); // bumped once, not twice
  });

  it("rejects an expired token and leaves the account untouched", async () => {
    const token = await requestAndCaptureToken();
    await db.user.update({ where: { id: t.userId }, data: { resetTokenExpiry: new Date(Date.now() - 1000) } });
    const before = await db.user.findUniqueOrThrow({ where: { id: t.userId } });

    const result = await resetPassword(token, "brand-new-pass1");
    expect(result).toMatchObject({ error: INVALID_RESET_MESSAGE, code: "BAD_REQUEST" });

    const after = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.tokenVersion).toBe(before.tokenVersion);
  });

  it("rejects a token that was never issued", async () => {
    const result = await resetPassword("f".repeat(64), "brand-new-pass1");
    expect(result).toMatchObject({ error: INVALID_RESET_MESSAGE, code: "BAD_REQUEST" });
  });

  it("enforces the password policy and keeps the token usable after a rejected weak password", async () => {
    const token = await requestAndCaptureToken();
    const weak = await resetPassword(token, "short1");
    expect(weak).toMatchObject({ code: "VALIDATION_FAILED" });
    const noDigit = await resetPassword(token, "onlyletters");
    expect(noDigit).toMatchObject({ code: "VALIDATION_FAILED" });
    // A typo in the form must not burn the link.
    expect(await resetPassword(token, "good-password-1")).toEqual({ ok: true });
  });

  it("writes an audit row (actor OWNER) for the reset", async () => {
    const token = await requestAndCaptureToken();
    await resetPassword(token, "brand-new-pass1");
    const rows = await db.auditLog.findMany({ where: { businessId: t.businessId, action: "auth.passwordReset" } });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]).toMatchObject({ actorType: "OWNER", entityType: "User", entityId: t.userId });
    // The audit row never contains the token or the password.
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(rows)).not.toContain("brand-new-pass1");
  });
});

describe("changePassword (signed in)", () => {
  it("requires the current password, applies the policy, bumps tokenVersion and clears any reset token", async () => {
    const wrong = await changePassword(t.userId, "not-the-password", "fresh-pass-123");
    expect(wrong).toMatchObject({ code: "BAD_REQUEST" });

    const weak = await changePassword(t.userId, OLD_PASSWORD, "weak");
    expect(weak).toMatchObject({ code: "VALIDATION_FAILED" });

    await requestAndCaptureToken(); // leaves a live reset token behind
    const before = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
    const ok = await changePassword(t.userId, OLD_PASSWORD, "fresh-pass-123");
    expect(ok).toMatchObject({ ok: true, tokenVersion: before.tokenVersion + 1 });

    const after = await db.user.findUniqueOrThrow({ where: { id: t.userId } });
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    expect(after.resetTokenHash).toBeNull();
    expect(await verifyPassword("fresh-pass-123", after.passwordHash)).toBe(true);
    expect(await db.auditLog.count({ where: { businessId: t.businessId, action: "auth.passwordChange" } })).toBeGreaterThanOrEqual(1);
  });
});
