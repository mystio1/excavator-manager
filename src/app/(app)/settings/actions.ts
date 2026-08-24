"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/session";
import {
  addBankAccount,
  archiveBankAccount,
  regenerateBusinessCode,
  updateBillLetterhead,
  updateBusinessProfile,
  updateOperatorLanguage,
} from "@/lib/services/settings";
import {
  bankAccountSchema,
  billLetterheadSchema,
  businessProfileSchema,
  operatorLanguageSchema,
} from "@/lib/validation/settings";

export type FormState = { error?: string; success?: boolean } | undefined;

export async function updateBusinessProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();

  const parsed = businessProfileSchema.safeParse({
    name: formData.get("name"),
    ownerName: formData.get("ownerName"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    gstNumber: formData.get("gstNumber"),
    defaultServiceIntervalHrs: formData.get("defaultServiceIntervalHrs"),
    maintenanceAlertThresholdHrs: formData.get("maintenanceAlertThresholdHrs"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  await updateBusinessProfile(businessId, parsed.data);
  revalidatePath("/settings");
  return { success: true };
}

export async function updateBillLetterheadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();

  const parsed = billLetterheadSchema.safeParse({
    logoLeftUrl: formData.get("logoLeftUrl") ?? "",
    logoRightUrl: formData.get("logoRightUrl") ?? "",
    signatureUrl: formData.get("signatureUrl") ?? "",
    billTagline: formData.get("billTagline") || undefined,
    billAccentColor: formData.get("billAccentColor"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  await updateBillLetterhead(businessId, parsed.data);
  revalidatePath("/settings");
  return { success: true };
}

export async function updateOperatorLanguageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();

  const parsed = operatorLanguageSchema.safeParse({
    operatorLanguage: formData.get("operatorLanguage"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  await updateOperatorLanguage(businessId, parsed.data.operatorLanguage);
  revalidatePath("/settings");
  return { success: true };
}

export async function addBankAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();

  const parsed = bankAccountSchema.safeParse({
    label: formData.get("label"),
    accountHolderName: formData.get("accountHolderName"),
    accountNumber: formData.get("accountNumber"),
    ifsc: formData.get("ifsc"),
    bankName: formData.get("bankName"),
    branch: formData.get("branch"),
    isDefaultForGst: formData.get("isDefaultForGst") === "on",
    isDefaultForNonGst: formData.get("isDefaultForNonGst") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  await addBankAccount(businessId, parsed.data);
  revalidatePath("/settings");
  return { success: true };
}

export async function archiveBankAccountAction(formData: FormData) {
  const { businessId } = await requireBusiness();
  const id = formData.get("id") as string;
  await archiveBankAccount(businessId, id);
  revalidatePath("/settings");
}

export async function regenerateBusinessCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();
  const customCode = (formData.get("customCode") as string) || undefined;

  if (customCode && !/^[A-Za-z0-9]{3,20}$/.test(customCode.trim())) {
    return { error: "Business code must be 3-20 letters/numbers, no spaces or symbols" };
  }

  const result = await regenerateBusinessCode(businessId, customCode);
  if ("error" in result) return { error: result.error };

  revalidatePath("/settings");
  return { success: true };
}
