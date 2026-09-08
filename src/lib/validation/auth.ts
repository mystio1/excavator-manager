import { z } from "zod";
import { BUSINESS_CODE_PATTERN, normalizeBusinessCode } from "@/lib/utils/businessCode";

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
  password: z.string().min(6, "Password must be at least 6 characters"),
  businessCode: optionalBusinessCode,
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or phone number"),
  password: z.string().min(1, "Enter your password"),
});

export const operatorLoginSchema = z.object({
  mobile: z.string().trim().min(6, "Enter a valid mobile number"),
  pin: z.string().trim().min(4, "Enter your PIN"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(6, "Password must be at least 6 characters"),
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
