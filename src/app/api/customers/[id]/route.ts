import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { archiveCustomer, updateCustomer } from "@/lib/services/customers";
import { addCustomerSchema } from "@/lib/validation/customer";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const parsed = addCustomerSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  await updateCustomer(auth.session.businessId, id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  await archiveCustomer(auth.session.businessId, id);
  return NextResponse.json({ ok: true });
}
