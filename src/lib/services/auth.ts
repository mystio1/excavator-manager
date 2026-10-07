import crypto from "crypto";
import { MIN_SUPPORT_REASON } from "@/lib/validation/support";
import { Prisma } from "@/generated/prisma/client";
import { fail, type ErrorCode } from "@/lib/api-error";
import { recordAudit } from "@/lib/audit";
import { appUrl } from "@/lib/config";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { hashPassword, verifyPassword, verifyPasswordOrDummy } from "@/lib/password";
import { passwordPolicyError } from "@/lib/password-policy";
import { clientIp } from "@/lib/rateLimit";
import {
  appPinRules,
  changePasswordRules,
  checkRateLimits,
  operatorLoginRules,
  ownerLoginRules,
  type Throttle,
} from "@/lib/auth-throttle";
import { DEFAULT_COMPONENT_LIBRARY } from "@/lib/services/serviceRecords";
import { findActiveSupportSession, SUPPORT_ACTOR } from "@/lib/supportTokens";
import { DEFAULT_TRANSACTION_CATEGORIES } from "@/lib/validation/operatorTransaction";
import { generateBusinessCode, normalizeBusinessCode } from "@/lib/utils/businessCode";
import type { z } from "zod";
import type { registerSchema } from "@/lib/validation/auth";

async function generateUniqueBusinessCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateBusinessCode();
    const existing = await db.business.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique business code");
}

export async function registerBusiness(input: z.infer<typeof registerSchema>) {
  const email = input.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return fail("CONFLICT", "An account with this email already exists");
  }
  // User.phone is unique (login-by-phone); without this check a duplicate
  // number surfaced as an opaque database error instead of a message.
  const phoneTaken = await db.user.findUnique({ where: { phone: input.phone } });
  if (phoneTaken) {
    return fail("CONFLICT", "An account with this phone number already exists");
  }

  // The owner can pick their own memorable code; left blank, one is
  // generated for them (see generateUniqueBusinessCode).
  let code: string;
  if (input.businessCode) {
    code = normalizeBusinessCode(input.businessCode);
    const codeTaken = await db.business.findUnique({ where: { code } });
    if (codeTaken) {
      return fail("CONFLICT", "That business code is already taken — try another one.");
    }
  } else {
    code = await generateUniqueBusinessCode();
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const business = await db.business.create({
      data: {
        name: input.businessName,
        ownerName: input.ownerName,
        phone: input.phone,
        code,
        users: {
          create: {
            name: input.ownerName,
            email,
            phone: input.phone,
            passwordHash,
            role: "OWNER",
          },
        },
        serviceItems: {
          create: DEFAULT_COMPONENT_LIBRARY.map((c) => ({
            name: c.name,
            category: c.category,
            isDefault: true,
            defaultIntervalHours: c.defaultIntervalHours,
          })),
        },
        transactionCategories: {
          create: DEFAULT_TRANSACTION_CATEGORIES.map((name) => ({ name, isDefault: true })),
        },
      },
    });
    return { businessId: business.id } as const;
  } catch (err) {
    // Two registrations racing past the checks above: the unique indexes are
    // the real guard, so turn their violation into the same clean message.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return fail("CONFLICT", "That email, phone number or business code is already registered.");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Sign-in (called from NextAuth's authorize(), so every path that can mint a
// session — our login routes AND the catch-all /api/auth/callback/* handler —
// goes through the same throttling and checks).
// ---------------------------------------------------------------------------

/** The user object stored into the session JWT. */
export type SessionUser = {
  id: string;
  email?: string;
  name: string;
  businessId: string;
  role: string;
  /** Copied into the JWT; a mismatch with the database value revokes the session (see session.ts). */
  tokenVersion: number;
  /** Set only for sessions opened by support impersonation; ends with that support session. */
  supportSessionId?: string;
};

/** Why a sign-in was refused. "credentials" is the one message used for
 * unknown account AND wrong password alike. */
export type SignInRejection = "credentials" | "account_frozen" | "rate_limited";

export type SignInResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "credentials" | "account_frozen" }
  | { ok: false; reason: "rate_limited"; retryAfterSec: number };

/** "@" means email, else it's a phone number — no email address can appear as
 * a phone number and vice versa. Includes the business's frozen flag so the
 * caller needs no second query. */
export function findUserByIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  const include = { business: { select: { frozen: true } } } as const;
  return trimmed.includes("@")
    ? db.user.findUnique({ where: { email: trimmed.toLowerCase() }, include })
    : db.user.findUnique({ where: { phone: trimmed }, include });
}

/**
 * Owner login (email or phone + password).
 *
 *  - Throttled per IP and per account BEFORE anything is checked; a correct
 *    login gives its attempt back (see auth-throttle.ts).
 *  - No account enumeration: an unknown identifier and a wrong password are
 *    indistinguishable — same result, and a dummy bcrypt compare runs when the
 *    account doesn't exist so response time doesn't differ either.
 *  - The frozen state is revealed ONLY after the password verified correctly;
 *    otherwise "is this account frozen?" would double as "does it exist?".
 */
export async function authenticateOwner(identifier: string, password: string, req?: Request): Promise<SignInResult> {
  const throttle = await checkRateLimits(ownerLoginRules(req ? clientIp(req) : "unknown", identifier));
  if (!throttle.allowed) return { ok: false, reason: "rate_limited", retryAfterSec: throttle.retryAfterSec };

  const user = await findUserByIdentifier(identifier);
  const valid = await verifyPasswordOrDummy(password, user?.passwordHash);
  if (!user || !valid) return { ok: false, reason: "credentials" };

  // A correct password is not a failed guess, whatever the frozen state.
  await throttle.refund();
  if (user.business.frozen) return { ok: false, reason: "account_frozen" };

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      businessId: user.businessId,
      role: user.role,
      tokenVersion: user.tokenVersion,
    },
  };
}

/**
 * Operator self-login: mobile + PIN, checked against the Operator table (not
 * User) — a wholly separate principal from the owner login. A mobile number
 * isn't guaranteed unique across businesses, so every canLogin operator sharing
 * it is tried until one PIN matches. PINs are only 4+ digits, so the per-mobile
 * limits are the tightest in the app (see operatorLoginRules).
 */
const MAX_OPERATOR_LOGIN_CANDIDATES = 5;

export async function authenticateOperator(mobile: string, pin: string, req?: Request): Promise<SignInResult> {
  const throttle = await checkRateLimits(operatorLoginRules(req ? clientIp(req) : "unknown", mobile));
  if (!throttle.allowed) return { ok: false, reason: "rate_limited", retryAfterSec: throttle.retryAfterSec };

  // Bounded and deterministic: every candidate costs a ~70 ms bcrypt compare, and
  // one counted attempt must not be able to trigger thousands of them (a login-
  // enabled operator row can be created with anyone's mobile number). Oldest
  // accounts first, so which tenant "wins" when two share a mobile and a PIN is
  // stable rather than arbitrary.
  const candidates = await db.operator.findMany({
    where: { mobile: mobile.trim(), canLogin: true, isArchived: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_OPERATOR_LOGIN_CANDIDATES,
  });

  let matched: (typeof candidates)[number] | null = null;
  let compared = false;
  for (const operator of candidates) {
    if (!operator.pinHash) continue;
    compared = true;
    if (await verifyPassword(pin, operator.pinHash)) {
      matched = operator;
      break;
    }
  }
  // Nothing to compare against (unknown mobile / no PIN set): spend the same
  // time a real comparison would, so the response doesn't reveal which mobiles exist.
  if (!compared) await verifyPasswordOrDummy(pin, null);

  if (!matched) return { ok: false, reason: "credentials" };

  await throttle.refund();
  return {
    ok: true,
    user: {
      id: matched.id,
      name: matched.name,
      businessId: matched.businessId,
      role: "OPERATOR",
      tokenVersion: matched.tokenVersion,
    },
  };
}

/**
 * Support-console impersonation (see /api/support/impersonate): signs the
 * target owner in as a real session. Never reachable with just a userId — the
 * caller must present a live support session token (exists in the database, not
 * revoked, not expired). The entry in the target business's audit trail is
 * written here, at the one choke point every impersonated session passes
 * through, so it cannot be skipped by calling the NextAuth callback directly.
 * The resulting session is tied to the support session (supportSessionId) and
 * stops working when that session ends.
 */
export async function authenticateSupportImpersonation(
  userId: string,
  supportToken: string,
  reason?: string,
): Promise<SessionUser | null> {
  const support = await findActiveSupportSession(supportToken);
  if (!support) return null;

  // "Support must say why" is enforced HERE, at the one place that writes the impersonation audit entry,
  // not only by the /api/support/impersonate route's schema: Auth.js also exposes this provider through
  // its catch-all callback route, and a live support token must not be usable there without a reason.
  const why = reason?.trim() ?? "";
  if (why.length < MIN_SUPPORT_REASON) return null;

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  await recordAudit(db, {
    businessId: user.businessId,
    actor: SUPPORT_ACTOR,
    action: "support.impersonate",
    entityType: "User",
    entityId: user.id,
    reason: why,
    details: { supportSessionId: support.id },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    businessId: user.businessId,
    role: user.role,
    tokenVersion: user.tokenVersion,
    supportSessionId: support.id,
  };
}

// ---------------------------------------------------------------------------
// Password reset / change
// ---------------------------------------------------------------------------

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const INVALID_RESET_MESSAGE = "This reset link is invalid or has expired — request a new one.";

export function hashResetToken(token: string) {
  // The raw token only ever exists in the emailed link — the DB holds a
  // hash of it, same principle as passwordHash never storing the plain
  // password. A single sha256 pass (no per-token salt) is enough here since
  // the token itself is 32 random bytes, not a human-guessable secret.
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Silently no-ops when the email isn't registered — the caller must show
 * the exact same "if that email is registered..." message either way, so
 * this endpoint can't be used to enumerate which emails have accounts.
 *
 * The link is built from the configured APP_URL, NEVER from the request's
 * Host / X-Forwarded-* headers: those are attacker-controlled, and a poisoned
 * Host would otherwise get a victim to receive a reset link pointing at the
 * attacker's server (and hand over the token on click).
 *
 * One live token per user: asking again replaces the previous one.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return;

  const token = crypto.randomBytes(32).toString("hex");
  await db.user.update({
    where: { id: user.id },
    data: { resetTokenHash: hashResetToken(token), resetTokenExpiry: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  await sendPasswordResetEmail(user.email, `${appUrl()}/reset-password?token=${token}`);
}

/** requestPasswordReset for fire-and-forget use: failures (mail provider down,
 * APP_URL missing) are logged, never surfaced — the response is identical
 * whether or not the email exists or the mail went out. */
export async function requestPasswordResetQuietly(email: string): Promise<void> {
  try {
    await requestPasswordReset(email);
  } catch (err) {
    logger.error("password reset email failed", err);
  }
}

/**
 * Consumes a reset token: sets the new password, clears the token (single use),
 * and bumps tokenVersion so every session issued before the reset — including
 * one an attacker may be holding — stops working.
 */
export async function resetPassword(token: string, newPassword: string) {
  const policyError = passwordPolicyError(newPassword);
  if (policyError) return fail("VALIDATION_FAILED", policyError);

  const tokenHash = hashResetToken(token);
  const user = await db.user.findFirst({
    where: { resetTokenHash: tokenHash, resetTokenExpiry: { gt: new Date() } },
    select: { id: true, businessId: true, name: true },
  });
  if (!user) return fail("BAD_REQUEST", INVALID_RESET_MESSAGE);

  const passwordHash = await hashPassword(newPassword);

  const consumed = await db.$transaction(async (tx) => {
    // The conditional update is the single-use guarantee: two concurrent
    // requests with the same token can both pass the lookup above, but only
    // one of them still matches here.
    const result = await tx.user.updateMany({
      where: { id: user.id, resetTokenHash: tokenHash, resetTokenExpiry: { gt: new Date() } },
      data: { passwordHash, resetTokenHash: null, resetTokenExpiry: null, tokenVersion: { increment: 1 } },
    });
    if (result.count !== 1) return false;
    await recordAudit(tx, {
      businessId: user.businessId,
      actor: { type: "OWNER", id: user.id, name: user.name },
      action: "auth.passwordReset",
      entityType: "User",
      entityId: user.id,
    });
    return true;
  });
  if (!consumed) return fail("BAD_REQUEST", INVALID_RESET_MESSAGE);

  return { ok: true } as const;
}

type Failure = { error: string; code?: ErrorCode; retryAfterSec?: number };

/**
 * Signed-in password change. Verifies the current password (throttled, since a
 * stolen session must not be able to guess it), applies the new-password
 * policy, and bumps tokenVersion — signing out every OTHER device (and this one
 * too: the caller re-signs-in to get a session carrying the new version).
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true; tokenVersion: number } | Failure> {
  const policyError = passwordPolicyError(newPassword);
  if (policyError) return fail("VALIDATION_FAILED", policyError);

  const throttle = await checkRateLimits(changePasswordRules(userId));
  if (!throttle.allowed) return { ...fail("RATE_LIMITED", throttle.message), retryAfterSec: throttle.retryAfterSec };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, businessId: true, name: true, passwordHash: true },
  });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return fail("BAD_REQUEST", "Your current password is incorrect");
  }
  await throttle.refund();

  const passwordHash = await hashPassword(newPassword);
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 }, resetTokenHash: null, resetTokenExpiry: null },
      select: { tokenVersion: true },
    });
    await recordAudit(tx, {
      businessId: user.businessId,
      actor: { type: "OWNER", id: user.id, name: user.name },
      action: "auth.passwordChange",
      entityType: "User",
      entityId: user.id,
    });
    return row;
  });

  return { ok: true, tokenVersion: updated.tokenVersion };
}

/**
 * "Sign out everywhere": bumps tokenVersion so every session JWT issued so far —
 * on every device, including the caller's — stops validating (the check runs on
 * every request, see src/lib/session.ts). For a lost phone or a shared device;
 * no password change needed. The audit entry records who did it.
 */
export async function signOutEverywhere(userId: string, businessId: string): Promise<{ ok: true; tokenVersion: number }> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true, name: true },
    });
    await recordAudit(tx, {
      businessId,
      actor: { type: "OWNER", id: userId, name: user.name },
      action: "auth.signOutEverywhere",
      entityType: "User",
      entityId: userId,
    });
    return { ok: true as const, tokenVersion: user.tokenVersion };
  });
}

// ---------------------------------------------------------------------------
// App-lock PIN
// ---------------------------------------------------------------------------

/**
 * A 4-6 digit PIN is only ~10,000-1,000,000 combinations — trivial to
 * brute-force without a limit, unlike a full password. One shared budget
 * per userId (not IP) across every place a currentPin gets checked —
 * verify, change, and disable all guess against the same PIN, so an
 * attacker blocked on one can't just move to another to keep guessing.
 * 5 failures per 5 minutes plus a daily cap; a correct PIN is refunded, so
 * unlocking the app any number of times a day never counts (appPinRules).
 */
export const PIN_RATE_LIMIT_MESSAGE = "Too many attempts. Please wait 5 minutes and try again.";

function pinBlocked(throttle: Extract<Throttle, { allowed: false }>) {
  // Within the 5-minute window the long-standing message applies verbatim
  // (routes outside this domain still match on it); a daily lockout says how long.
  const message = throttle.retryAfterSec <= 300 ? PIN_RATE_LIMIT_MESSAGE : throttle.message;
  return { ...fail("RATE_LIMITED", message), retryAfterSec: throttle.retryAfterSec };
}

/**
 * Sets or changes the owner's app-lock PIN — a lightweight re-unlock gate
 * the (app) layout shows on a fresh app open when one is set (see
 * (app)/layout.tsx and /api/auth/verify-pin), layered on top of the real
 * session rather than replacing it. Changing an existing PIN requires the
 * current one; setting the first one doesn't, since being logged into
 * Settings at all is already the base authorization for that.
 */
export async function setAppPin(
  userId: string,
  currentPin: string | undefined,
  newPin: string,
): Promise<{ ok: true } | Failure> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  if (user.appPinHash) {
    const throttle = await checkRateLimits(appPinRules(userId));
    if (!throttle.allowed) return pinBlocked(throttle);
    if (!currentPin || !(await verifyPassword(currentPin, user.appPinHash))) {
      return fail("BAD_REQUEST", "Incorrect current PIN");
    }
    await throttle.refund();
  }

  const appPinHash = await hashPassword(newPin);
  await db.user.update({ where: { id: userId }, data: { appPinHash } });
  return { ok: true };
}

export async function disableAppPin(userId: string, currentPin: string): Promise<{ ok: true } | Failure> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.appPinHash) return fail("BAD_REQUEST", "No PIN is set");

  const throttle = await checkRateLimits(appPinRules(userId));
  if (!throttle.allowed) return pinBlocked(throttle);
  if (!(await verifyPassword(currentPin, user.appPinHash))) {
    return fail("BAD_REQUEST", "Incorrect PIN");
  }
  await throttle.refund();

  await db.user.update({ where: { id: userId }, data: { appPinHash: null } });
  return { ok: true };
}

export async function verifyAppPin(userId: string, pin: string): Promise<{ ok: true } | Failure> {
  const throttle = await checkRateLimits(appPinRules(userId));
  if (!throttle.allowed) return pinBlocked(throttle);

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.appPinHash) {
    await throttle.refund();
    return { ok: true };
  }
  if (!(await verifyPassword(pin, user.appPinHash))) {
    return fail("UNAUTHORIZED", "Incorrect PIN");
  }
  await throttle.refund();

  return { ok: true };
}
