import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { archiveOperator, updateOperator } from "@/lib/services/operators";
import { addOperatorSchema } from "@/lib/validation/operator";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const parsed = addOperatorSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  await updateOperator(auth.session.businessId, id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  await archiveOperator(auth.session.businessId, id);
  return NextResponse.json({ ok: true });
}
