"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { requestOperatorJoin } from "@/lib/services/operators";
import { operatorLoginSchema } from "@/lib/validation/auth";
import { operatorSignupSchema } from "@/lib/validation/operator";

export type SignupFormState = { error?: string } | { success: true; message: string } | undefined;
export type FormState = { error?: string } | undefined;

export async function operatorSignupAction(_prev: SignupFormState, formData: FormData): Promise<SignupFormState> {
  const parsed = operatorSignupSchema.safeParse({
    businessCode: formData.get("businessCode"),
    name: formData.get("name"),
    mobile: formData.get("mobile"),
    pin: formData.get("pin"),
    confirmPin: formData.get("confirmPin"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await requestOperatorJoin(
    parsed.data.businessCode,
    parsed.data.name,
    parsed.data.mobile,
    parsed.data.pin,
  );
  if ("error" in result) return { error: result.error };

  // Only a leftover pre-approved (legacy invite) row logs straight in —
  // a fresh join request stays canLogin=false until the Admin approves it.
  if (result.status === "PENDING") {
    return { success: true, message: "Request submitted! Ask your admin to approve your account, then log in below." };
  }

  try {
    await signIn("operator", {
      mobile: parsed.data.mobile,
      pin: parsed.data.pin,
      redirectTo: "/operator",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: true, message: "Account activated — please log in below." };
    }
    throw error;
  }
}

export async function operatorLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = operatorLoginSchema.safeParse({
    mobile: formData.get("mobile"),
    pin: formData.get("pin"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  try {
    await signIn("operator", {
      mobile: parsed.data.mobile,
      pin: parsed.data.pin,
      redirectTo: "/operator",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Wrong mobile number or PIN" };
    }
    throw error;
  }
}

export async function operatorLogoutAction() {
  await signOut({ redirectTo: "/operator-login" });
}
