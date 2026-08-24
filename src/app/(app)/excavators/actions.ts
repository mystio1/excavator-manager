"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/session";
import { archiveExcavator, createExcavator, setExcavatorSite, updateExcavator } from "@/lib/services/excavators";
import {
  addDailyLog,
  approveDailyLog,
  deleteDailyLog,
  rejectDailyLog,
  startWork,
  stopWork,
} from "@/lib/services/workSessions";
import { assignOperator, endOperatorAssignment } from "@/lib/services/operatorAssignments";
import { createCustomComponent, createServiceRecord } from "@/lib/services/serviceRecords";
import { addExcavatorSchema, editExcavatorSchema, setExcavatorSiteSchema } from "@/lib/validation/excavator";
import { dailyLogSchema, startWorkSchema, stopWorkSchema } from "@/lib/validation/workSession";
import { assignOperatorSchema } from "@/lib/validation/operatorAssignment";
import { addComponentSchema, createServiceRecordSchema } from "@/lib/validation/serviceRecord";

export type FormState = { error?: string } | undefined;

export async function addExcavatorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();

  const parsed = addExcavatorSchema.safeParse({
    name: formData.get("name"),
    machineNumber: formData.get("machineNumber"),
    brand: formData.get("brand"),
    model: formData.get("model"),
    purchaseDate: formData.get("purchaseDate"),
    startingHourMeter: formData.get("startingHourMeter"),
    serviceIntervalHrs: formData.get("serviceIntervalHrs") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const excavator = await createExcavator(businessId, parsed.data);
  revalidatePath("/excavators");
  redirect(`/excavators/${excavator.id}`);
}

export async function editExcavatorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();
  const id = formData.get("id") as string;

  const parsed = editExcavatorSchema.safeParse({
    name: formData.get("name"),
    machineNumber: formData.get("machineNumber"),
    brand: formData.get("brand"),
    model: formData.get("model"),
    purchaseDate: formData.get("purchaseDate"),
    serviceIntervalHrs: formData.get("serviceIntervalHrs") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  await updateExcavator(businessId, id, parsed.data);
  revalidatePath("/excavators");
  revalidatePath(`/excavators/${id}`);
  redirect(`/excavators/${id}`);
}

export async function archiveExcavatorAction(formData: FormData) {
  const { businessId } = await requireBusiness();
  const id = formData.get("id") as string;
  await archiveExcavator(businessId, id);
  revalidatePath("/excavators");
  redirect("/excavators");
}

export async function startWorkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();

  const parsed = startWorkSchema.safeParse({
    excavatorId: formData.get("excavatorId"),
    customerId: formData.get("customerId"),
    siteName: formData.get("siteName"),
    startDate: formData.get("startDate"),
    startHourMeter: formData.get("startHourMeter"),
    attachment: formData.get("attachment") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await startWork(businessId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath(`/excavators/${parsed.data.excavatorId}`);
  revalidatePath("/excavators");
  redirect(`/excavators/${parsed.data.excavatorId}`);
}

export async function addDailyLogAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();
  const excavatorId = formData.get("excavatorId") as string;

  const parsed = dailyLogSchema.safeParse({
    workSessionId: formData.get("workSessionId"),
    date: formData.get("date"),
    startHourMeter: formData.get("startHourMeter") || undefined,
    endHourMeter: formData.get("endHourMeter") || undefined,
    startTime: formData.get("startTime") || undefined,
    stopTime: formData.get("stopTime") || undefined,
    breakMinutes: formData.get("breakMinutes") || undefined,
    operatorName: formData.get("operatorName") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await addDailyLog(businessId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath(`/excavators/${excavatorId}`);
  redirect(`/excavators/${excavatorId}`);
}

export async function stopWorkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();
  const excavatorId = formData.get("excavatorId") as string;

  const parsed = stopWorkSchema.safeParse({
    workSessionId: formData.get("workSessionId"),
    endDate: formData.get("endDate"),
    endHourMeter: formData.get("endHourMeter"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await stopWork(businessId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath(`/excavators/${excavatorId}`);
  revalidatePath("/excavators");
  redirect(`/excavators/${excavatorId}`);
}

export async function setExcavatorSiteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();
  const excavatorId = formData.get("excavatorId") as string;

  const parsed = setExcavatorSiteSchema.safeParse({
    excavatorId,
    siteName: formData.get("siteName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await setExcavatorSite(businessId, parsed.data.excavatorId, parsed.data.siteName);
  if ("error" in result) return { error: result.error };

  revalidatePath(`/excavators/${excavatorId}`);
  revalidatePath("/excavators");
  return undefined;
}

export async function assignOperatorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();
  const excavatorId = formData.get("excavatorId") as string;

  const parsed = assignOperatorSchema.safeParse({
    excavatorId,
    operatorId: formData.get("operatorId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await assignOperator(businessId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath(`/excavators/${excavatorId}`);
  revalidatePath("/excavators");
  revalidatePath("/operators");
  redirect(`/excavators/${excavatorId}`);
}

export async function endOperatorAssignmentAction(formData: FormData) {
  const { businessId } = await requireBusiness();
  const excavatorId = formData.get("excavatorId") as string;
  await endOperatorAssignment(businessId, excavatorId);
  revalidatePath(`/excavators/${excavatorId}`);
  revalidatePath("/excavators");
  revalidatePath("/operators");
  redirect(`/excavators/${excavatorId}`);
}

export async function approveDailyLogAction(formData: FormData) {
  const { businessId } = await requireBusiness();
  const logId = formData.get("logId") as string;
  const redirectTo = (formData.get("redirectTo") as string) || "/operators/approvals";
  await approveDailyLog(businessId, logId);
  revalidatePath(redirectTo);
  revalidatePath("/dashboard");
  redirect(redirectTo);
}

export async function rejectDailyLogAction(formData: FormData) {
  const { businessId } = await requireBusiness();
  const logId = formData.get("logId") as string;
  const redirectTo = (formData.get("redirectTo") as string) || "/operators/approvals";
  await rejectDailyLog(businessId, logId);
  revalidatePath(redirectTo);
  revalidatePath("/dashboard");
  redirect(redirectTo);
}

export async function deleteDailyLogAction(formData: FormData) {
  const { businessId } = await requireBusiness();
  const logId = formData.get("logId") as string;
  const redirectTo = (formData.get("redirectTo") as string) || "/excavators";
  await deleteDailyLog(businessId, logId);
  revalidatePath(redirectTo);
  revalidatePath("/dashboard");
  redirect(redirectTo);
}

export async function createServiceRecordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();
  const excavatorId = formData.get("excavatorId") as string;

  let items: unknown = [];
  try {
    items = JSON.parse((formData.get("items") as string) || "[]");
  } catch {
    return { error: "Something went wrong reading the checklist — please try again" };
  }

  const parsed = createServiceRecordSchema.safeParse({
    excavatorId,
    serviceDate: formData.get("serviceDate"),
    hourMeterAtService: formData.get("hourMeterAtService"),
    notes: formData.get("notes") || undefined,
    items,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const result = await createServiceRecord(businessId, parsed.data);
  if ("error" in result) return { error: result.error };

  revalidatePath(`/excavators/${excavatorId}`);
  revalidatePath("/excavators");
  revalidatePath("/dashboard");
  redirect(`/excavators/${excavatorId}?tab=service`);
}

export type AddComponentState =
  | { error: string; component?: undefined }
  | { error?: undefined; component: { id: string; name: string; category: string } }
  | undefined;

export async function addComponentAction(
  _prev: AddComponentState,
  formData: FormData,
): Promise<AddComponentState> {
  const { businessId } = await requireBusiness();

  const parsed = addComponentSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const component = await createCustomComponent(businessId, parsed.data);
  return { component: { id: component.id, name: component.name, category: component.category } };
}
