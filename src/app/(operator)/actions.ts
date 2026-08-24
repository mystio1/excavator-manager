"use server";

import { revalidatePath } from "next/cache";
import { requireOperator } from "@/lib/session";
import { submitDailyLog } from "@/lib/services/workSessions";
import { editOperatorWorkRequest, endOperatorWork, startOperatorWork } from "@/lib/services/operatorWorkRequests";
import { updateOperatorOwnLanguage } from "@/lib/services/operators";
import { dailyLogSchema } from "@/lib/validation/workSession";
import { editOperatorWorkRequestSchema, endOperatorWorkSchema, startOperatorWorkSchema } from "@/lib/validation/operatorWorkRequest";
import { operatorLanguageSchema } from "@/lib/validation/settings";

export type FormState = { error?: string } | undefined;

export async function updateOwnOperatorLanguageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { operatorId } = await requireOperator();

  const parsed = operatorLanguageSchema.safeParse({
    operatorLanguage: formData.get("operatorLanguage"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  await updateOperatorOwnLanguage(operatorId, parsed.data.operatorLanguage);
  revalidatePath("/operator");
  return undefined;
}

export async function submitReadingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { operatorId } = await requireOperator();

  const parsed = dailyLogSchema.safeParse({
    workSessionId: formData.get("workSessionId"),
    date: formData.get("date"),
    startHourMeter: formData.get("startHourMeter") || undefined,
    endHourMeter: formData.get("endHourMeter") || undefined,
    startTime: formData.get("startTime") || undefined,
    stopTime: formData.get("stopTime") || undefined,
    breakMinutes: formData.get("breakMinutes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await submitDailyLog(operatorId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath("/operator");
  return undefined;
}

export async function startOperatorWorkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { operatorId } = await requireOperator();

  const parsed = startOperatorWorkSchema.safeParse({
    startHourMeter: formData.get("startHourMeter"),
    attachment: formData.get("attachment") || undefined,
    siteName: formData.get("siteName") || undefined,
    dieselLiters: formData.get("dieselLiters") || undefined,
    dieselDate: formData.get("dieselDate") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await startOperatorWork(operatorId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath("/operator");
  return undefined;
}

export async function endOperatorWorkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { operatorId } = await requireOperator();

  const parsed = endOperatorWorkSchema.safeParse({
    requestId: formData.get("requestId"),
    endHourMeter: formData.get("endHourMeter"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await endOperatorWork(operatorId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath("/operator");
  return undefined;
}

export async function editOperatorWorkRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { operatorId } = await requireOperator();

  const parsed = editOperatorWorkRequestSchema.safeParse({
    requestId: formData.get("requestId"),
    startHourMeter: formData.get("startHourMeter"),
    endHourMeter: formData.get("endHourMeter") || undefined,
    attachment: formData.get("attachment") || undefined,
    siteName: formData.get("siteName") || undefined,
    dieselLiters: formData.get("dieselLiters") || undefined,
    dieselDate: formData.get("dieselDate") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await editOperatorWorkRequest(operatorId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath("/operator");
  return undefined;
}
