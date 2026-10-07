import { z } from "zod";
import { BUSINESS_CODE_PATTERN, normalizeBusinessCode } from "@/lib/utils/businessCode";
import { passwordPolicyError } from "@/lib/password-policy";

/** The policy for NEW passwords (register / reset / change) — see
 * password-policy.ts. Login deliberately does NOT use this, so accounts made
 * under the old 6-character rule can still sign in. */
export const newPasswordSchema = z.string().superRefine((value, ctx) => {
  const message = passwordPolicyError(value);
  if (message) ctx.addIssue({ code: "custom", message });
});

// Left blank, a random code is generated instead — see registerBusiness.
const optionalBusinessCode = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || BUSINESS_CODE_PATTERN.test(normalizeBusinessCode(v)), {
    message: "Business code must be 3-20 letters/numbers, no spaces or symbols",
  });

export const registerSchema = z.object({
  businessName: z.string().trim().min(1, "Enter your business name"),
  ownerName: z.string().trim().min(1, "Enter your name"),
  phone: z.string().trim().min(6, "Enter a valid phone number"),
  email: z.string().trim().email("Enter a valid email"),
  password: newPasswordSchema,
  businessCode: optionalBusinessCode,
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or phone number").max(254, "Enter your email or phone number"),
  // No strength rules here on purpose (see newPasswordSchema); the max only
  // keeps absurd payloads out of bcrypt.
  password: z.string().min(1, "Enter your password").max(1024, "Wrong email/phone or password"),
});

export const operatorLoginSchema = z.object({
  mobile: z.string().trim().min(6, "Enter a valid mobile number").max(32, "Enter a valid mobile number"),
  pin: z.string().trim().min(4, "Enter your PIN").max(64, "Wrong mobile number or PIN"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(254, "Enter a valid email"),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1).max(256),
    password: newPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

const appPinDigits = z
  .string()
  .trim()
  .regex(/^(\d{4}|\d{6})$/, "PIN must be exactly 4 or 6 digits");

// currentPin is required only once a PIN already exists — enforced in the
// route/service, not here, since that depends on server-side state (whether
// User.appPinHash is set) this schema alone can't see.
export const setAppPinSchema = z
  .object({
    currentPin: z.string().trim().optional(),
    newPin: appPinDigits,
    confirmPin: z.string().trim(),
  })
  .refine((data) => data.newPin === data.confirmPin, {
    message: "PINs don't match",
    path: ["confirmPin"],
  });

export const disableAppPinSchema = z.object({
  currentPin: z.string().trim().min(1, "Enter your current PIN"),
});

export const verifyAppPinSchema = z.object({
  pin: z.string().trim().min(1, "Enter your PIN"),
});

/** Signed-in password change. The current password is verified server-side
 * (no policy on it: it may predate the policy). */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(1024),
  newPassword: newPasswordSchema,
});
