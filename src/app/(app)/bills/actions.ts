"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/session";
import { addPayment, createBill, createDirectBill } from "@/lib/services/bills";
import { addPaymentSchema, generateBillSchema } from "@/lib/validation/bill";
import { generateDirectBillSchema } from "@/lib/validation/directBill";

export type FormState = { error?: string } | undefined;

export async function generateBillAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();

  const parsed = generateBillSchema.safeParse({
    customerId: formData.get("customerId"),
    workSessionIds: formData.getAll("workSessionIds"),
    billDate: formData.get("billDate"),
    ratePerHour: formData.get("ratePerHour"),
    transportCharges: formData.get("transportCharges") || 0,
    fuelCharges: formData.get("fuelCharges") || 0,
    extraCharges: formData.get("extraCharges") || 0,
    bucketCharge: formData.get("bucketCharge") || 0,
    breakerCharge: formData.get("breakerCharge") || 0,
    discount: formData.get("discount") || 0,
    billType: formData.get("billType"),
    billNumber: formData.get("billNumber") || undefined,
    gstPercentage: formData.get("gstPercentage") || undefined,
    buyerGstin: formData.get("buyerGstin") || undefined,
    bankAccountId: formData.get("bankAccountId") || undefined,
    notes: formData.get("notes") || undefined,
    showCustomerPhone: formData.get("showCustomerPhone") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await createBill(businessId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath("/bills");
  redirect(`/bills/${result.bill.id}`);
}

export async function generateDirectBillAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();

  const parsed = generateDirectBillSchema.safeParse({
    customerId: formData.get("customerId"),
    excavatorId: formData.get("excavatorId"),
    billDate: formData.get("billDate"),
    fromDate: formData.get("fromDate"),
    toDate: formData.get("toDate"),
    bucketHours: formData.get("bucketHours") || 0,
    bucketRate: formData.get("bucketRate") || 0,
    breakerHours: formData.get("breakerHours") || 0,
    breakerRate: formData.get("breakerRate") || 0,
    transportCharges: formData.get("transportCharges") || 0,
    dieselLiters: formData.get("dieselLiters") || 0,
    dieselPricePerLiter: formData.get("dieselPricePerLiter") || 0,
    billType: formData.get("billType"),
    billNumber: formData.get("billNumber") || undefined,
    gstPercentage: formData.get("gstPercentage") || undefined,
    buyerGstin: formData.get("buyerGstin") || undefined,
    bankAccountId: formData.get("bankAccountId") || undefined,
    notes: formData.get("notes") || undefined,
    showCustomerPhone: formData.get("showCustomerPhone") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await createDirectBill(businessId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath("/bills");
  redirect(`/bills/${result.bill.id}`);
}

export async function addPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();
  const billId = formData.get("billId") as string;

  const parsed = addPaymentSchema.safeParse({
    billId,
    amount: formData.get("amount"),
    date: formData.get("date"),
    method: formData.get("method") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await addPayment(businessId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath(`/bills/${billId}`);
  revalidatePath("/bills");
  return undefined;
}
