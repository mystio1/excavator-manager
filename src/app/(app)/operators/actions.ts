"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/session";
import { archiveOperator, createOperator, setOperatorPin, updateOperator } from "@/lib/services/operators";
import { createTransaction } from "@/lib/services/operatorTransactions";
import { approveWorkRequest, rejectWorkRequest } from "@/lib/services/operatorWorkRequests";
import { addOperatorSchema, setOperatorPinSchema } from "@/lib/validation/operator";
import { addTransactionSchema } from "@/lib/validation/operatorTransaction";
import { approveWorkRequestSchema, rejectWorkRequestSchema } from "@/lib/validation/operatorWorkRequest";

export type FormState = { error?: string } | undefined;

export async function addOperatorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();

  const parsed = addOperatorSchema.safeParse({
    name: formData.get("name"),
    mobile: formData.get("mobile"),
    address: formData.get("address"),
    joiningDate: formData.get("joiningDate"),
    defaultMonthlySalary: formData.get("defaultMonthlySalary") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const operator = await createOperator(businessId, parsed.data);
  revalidatePath("/operators");
  redirect(`/operators/${operator.id}`);
}

export async function editOperatorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();
  const id = formData.get("id") as string;

  const parsed = addOperatorSchema.safeParse({
    name: formData.get("name"),
    mobile: formData.get("mobile"),
    address: formData.get("address"),
    joiningDate: formData.get("joiningDate"),
    defaultMonthlySalary: formData.get("defaultMonthlySalary") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  await updateOperator(businessId, id, parsed.data);
  revalidatePath("/operators");
  revalidatePath(`/operators/${id}`);
  redirect(`/operators/${id}`);
}

export async function archiveOperatorAction(formData: FormData) {
  const { businessId } = await requireBusiness();
  const id = formData.get("id") as string;
  await archiveOperator(businessId, id);
  revalidatePath("/operators");
  redirect("/operators");
}

export async function approveOperatorJoinAction(formData: FormData) {
  const { businessId } = await requireBusiness();
  const id = formData.get("id") as string;
  await setOperatorPin(businessId, id, { canLogin: true });
  revalidatePath("/operators");
  revalidatePath(`/operators/${id}`);
}

export async function declineOperatorJoinAction(formData: FormData) {
  const { businessId } = await requireBusiness();
  const id = formData.get("id") as string;
  await setOperatorPin(businessId, id, { canLogin: false });
  revalidatePath("/operators");
  revalidatePath(`/operators/${id}`);
}

export async function setOperatorPinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();
  const operatorId = formData.get("operatorId") as string;
  const canLogin = formData.get("canLogin") === "on";

  if (!canLogin) {
    await setOperatorPin(businessId, operatorId, { canLogin: false });
    revalidatePath(`/operators/${operatorId}`);
    redirect(`/operators/${operatorId}`);
  }

  const parsed = setOperatorPinSchema.safeParse({ pin: formData.get("pin") || undefined });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the PIN" };
  }

  await setOperatorPin(businessId, operatorId, { canLogin: true, pin: parsed.data.pin || undefined });
  revalidatePath(`/operators/${operatorId}`);
  redirect(`/operators/${operatorId}`);
}

export async function addTransactionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();
  const operatorId = formData.get("operatorId") as string;

  const parsed = addTransactionSchema.safeParse({
    operatorId,
    categoryId: formData.get("categoryId") || undefined,
    newCategoryName: formData.get("newCategoryName") || undefined,
    amount: formData.get("amount"),
    date: formData.get("date"),
    notes: formData.get("notes") || undefined,
    deductFromSalary: formData.get("deductFromSalary") === "on",
    businessEffect: formData.get("businessEffect"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  await createTransaction(businessId, parsed.data);
  revalidatePath(`/operators/${operatorId}`);
  revalidatePath("/dashboard");
  redirect(`/operators/${operatorId}?tab=transactions`);
}

export async function approveWorkRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();

  const parsed = approveWorkRequestSchema.safeParse({
    requestId: formData.get("requestId"),
    customerId: formData.get("customerId") || undefined,
    newCustomerName: formData.get("newCustomerName") || undefined,
    newCustomerMobile: formData.get("newCustomerMobile") || undefined,
    siteName: formData.get("siteName"),
    startHourMeter: formData.get("startHourMeter"),
    endHourMeter: formData.get("endHourMeter"),
    attachment: formData.get("attachment") || undefined,
    dieselLiters: formData.get("dieselLiters") || undefined,
    dieselDate: formData.get("dieselDate") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await approveWorkRequest(businessId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath("/operators/approvals");
  revalidatePath("/operators");
  revalidatePath("/dashboard");
  revalidatePath(`/excavators/${result.session.excavatorId}`);
  revalidatePath("/excavators");
  return undefined;
}

export async function rejectWorkRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();

  const parsed = rejectWorkRequestSchema.safeParse({
    requestId: formData.get("requestId"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await rejectWorkRequest(businessId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath("/operators/approvals");
  revalidatePath("/operators");
  revalidatePath("/dashboard");
  revalidatePath("/excavators");
  return undefined;
}
