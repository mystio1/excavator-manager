"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/session";
import { archiveCustomer, createCustomer, updateCustomer } from "@/lib/services/customers";
import { addCustomerSchema } from "@/lib/validation/customer";

export type FormState = { error?: string } | undefined;

export async function addCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();

  const parsed = addCustomerSchema.safeParse({
    name: formData.get("name"),
    mobile: formData.get("mobile"),
    companyName: formData.get("companyName"),
    address: formData.get("address"),
    gstNumber: formData.get("gstNumber"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const customer = await createCustomer(businessId, parsed.data);
  revalidatePath("/customers");
  redirect(`/customers/${customer.id}`);
}

export async function editCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireBusiness();
  const id = formData.get("id") as string;

  const parsed = addCustomerSchema.safeParse({
    name: formData.get("name"),
    mobile: formData.get("mobile"),
    companyName: formData.get("companyName"),
    address: formData.get("address"),
    gstNumber: formData.get("gstNumber"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  await updateCustomer(businessId, id, parsed.data);
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}`);
}

export async function archiveCustomerAction(formData: FormData) {
  const { businessId } = await requireBusiness();
  const id = formData.get("id") as string;
  await archiveCustomer(businessId, id);
  revalidatePath("/customers");
  redirect("/customers");
}

export type QuickAddCustomerState =
  | { error: string; customer?: undefined }
  | { error?: undefined; customer: { id: string; name: string; companyName: string | null } }
  | undefined;

/** Inline quick-add used from within another dialog (e.g. Start Work) —
 * same validation as the full Add Customer form, but returns the created
 * customer instead of redirecting, so the caller can select it immediately. */
export async function quickAddCustomerAction(
  _prev: QuickAddCustomerState,
  formData: FormData,
): Promise<QuickAddCustomerState> {
  const { businessId } = await requireBusiness();

  // Unlike the full Add Customer form, this quick-add form only has
  // name/mobile fields — formData.get() on the other keys returns null
  // (absent), not "" (empty), and Zod's .optional() rejects null. Coerce
  // to undefined so those fields are treated as genuinely unset.
  const parsed = addCustomerSchema.safeParse({
    name: formData.get("name"),
    mobile: formData.get("mobile"),
    companyName: formData.get("companyName") || undefined,
    address: formData.get("address") || undefined,
    gstNumber: formData.get("gstNumber") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }

  const customer = await createCustomer(businessId, parsed.data);
  revalidatePath("/customers");
  return { customer: { id: customer.id, name: customer.name, companyName: customer.companyName } };
}
