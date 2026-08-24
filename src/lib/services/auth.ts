import crypto from "crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
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
