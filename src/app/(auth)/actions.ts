"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { registerBusiness, requestPasswordReset, resetPassword } from "@/lib/services/auth";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validation/auth";

export type FormState = { error?: string } | undefined;

/** The link in the reset email always points back at whichever host the
 * request actually came in on — localhost during dev, or the current
 * Cloudflare tunnel URL when testing through that — rather than a hardcoded
 * env var that would go stale the moment the tunnel URL rotates. */
async function getRequestOrigin() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type ForgotPasswordState = { error?: string; submitted?: boolean } | undefined;

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid email" };
  }

  try {
    const origin = await getRequestOrigin();
    await requestPasswordReset(parsed.data.email, origin);
  } catch (err) {
    // A real send failure (e.g. SMTP not configured yet) — logged for
    // whoever's setting this up, but the user still sees the same generic
    // message below so account existence is never revealed either way.
    console.error("Failed to send password reset email:", err);
  }

  return { submitted: true };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await resetPassword(parsed.data.token, parsed.data.password);
  if ("error" in result) return { error: result.error };

  redirect("/login?reset=1");
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    businessName: formData.get("businessName"),
    ownerName: formData.get("ownerName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
    businessCode: formData.get("businessCode") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await registerBusiness(parsed.data);
  if ("error" in result) {
    return { error: result.error };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created — please log in" };
    }
    throw error;
  }
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Wrong email or password" };
    }
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
