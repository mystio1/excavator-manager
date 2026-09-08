import crypto from "crypto";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { rateLimited } from "@/lib/rateLimit";
import { sendPasswordResetEmail } from "@/lib/email";
import { DEFAULT_COMPONENT_LIBRARY } from "@/lib/services/serviceRecords";
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
  const existing = await db.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) {
    return { error: "An account with this email already exists" } as const;
  }

  // The owner can pick their own memorable code; left blank, one is
  // generated for them (see generateUniqueBusinessCode).
  let code: string;
  if (input.businessCode) {
    code = normalizeBusinessCode(input.businessCode);
    const codeTaken = await db.business.findUnique({ where: { code } });
    if (codeTaken) {
      return { error: "That business code is already taken — try another one." } as const;
    }
  } else {
    code = await generateUniqueBusinessCode();
  }

  const passwordHash = await hashPassword(input.password);

  const business = await db.business.create({
    data: {
      name: input.businessName,
      ownerName: input.ownerName,
      phone: input.phone,
      code,
      users: {
        create: {
          name: input.ownerName,
          email: input.email.toLowerCase(),
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
}

/** Same "@" means email, else it's a phone number" rule the credentials
 * provider's authorize() uses (see auth.ts) — kept here so both it and the
 * frozen pre-check below resolve an identifier to a user identically. */
export function findUserByIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  return trimmed.includes("@")
    ? db.user.findUnique({ where: { email: trimmed.toLowerCase() } })
    : db.user.findUnique({ where: { phone: trimmed } });
}

/**
 * Blocks a login attempt outright once support has frozen the business —
 * checked before the password, same order the support console's reference
 * app uses (a frozen account's login always fails with the frozen message,
 * never "wrong password", regardless of which one was actually wrong).
 * Without this, the credentials provider would still authenticate a frozen
 * owner and only turn them away on their next request via requireBusinessApi
 * — a fully logged-in session that immediately hits a wall on every route
 * instead of never getting one in the first place.
 */
export async function isLoginBlockedByFrozenBusiness(identifier: string) {
  const user = await findUserByIdentifier(identifier);
  if (!user) return false;
  const business = await db.business.findUnique({ where: { id: user.businessId }, select: { frozen: true } });
  return business?.frozen ?? false;
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashResetToken(token: string) {
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
 */
export async function requestPasswordReset(email: string, resetUrlBase: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return;

  const token = crypto.randomBytes(32).toString("hex");
  await db.user.update({
    where: { id: user.id },
    data: { resetTokenHash: hashResetToken(token), resetTokenExpiry: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  await sendPasswordResetEmail(user.email, `${resetUrlBase}/reset-password?token=${token}`);
}

export async function resetPassword(token: string, newPassword: string) {
  const user = await db.user.findFirst({ where: { resetTokenHash: hashResetToken(token) } });
  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    return { error: "This reset link is invalid or has expired — request a new one." } as const;
  }

  const passwordHash = await hashPassword(newPassword);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiry: null },
  });

  return { ok: true } as const;
}

/**
 * A 4-6 digit PIN is only ~10,000-1,000,000 combinations — trivial to
 * brute-force without a limit, unlike a full password. One shared budget
 * per userId (not IP) across every place a currentPin gets checked —
 * verify, change, and disable all guess against the same PIN, so an
 * attacker blocked on one can't just move to another to keep guessing.
 */
function pinRateLimited(userId: string) {
  return rateLimited(`app-pin:${userId}`, 5, 5 * 60 * 1000);
}
export const PIN_RATE_LIMIT_MESSAGE = "Too many attempts. Please wait 5 minutes and try again.";

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
): Promise<{ ok: true } | { error: string }> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  if (user.appPinHash) {
    if (pinRateLimited(userId)) return { error: PIN_RATE_LIMIT_MESSAGE };
    if (!currentPin || !(await verifyPassword(currentPin, user.appPinHash))) {
      return { error: "Incorrect current PIN" };
    }
  }

  const appPinHash = await hashPassword(newPin);
  await db.user.update({ where: { id: userId }, data: { appPinHash } });
  return { ok: true };
}

export async function disableAppPin(userId: string, currentPin: string): Promise<{ ok: true } | { error: string }> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.appPinHash) return { error: "No PIN is set" };
  if (pinRateLimited(userId)) return { error: PIN_RATE_LIMIT_MESSAGE };
  if (!(await verifyPassword(currentPin, user.appPinHash))) {
    return { error: "Incorrect PIN" };
  }

  await db.user.update({ where: { id: userId }, data: { appPinHash: null } });
  return { ok: true };
}

export async function verifyAppPin(userId: string, pin: string): Promise<{ ok: true } | { error: string }> {
  if (pinRateLimited(userId)) return { error: PIN_RATE_LIMIT_MESSAGE };

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.appPinHash) return { ok: true };
  if (!(await verifyPassword(pin, user.appPinHash))) {
    return { error: "Incorrect PIN" };
  }

  return { ok: true };
}
