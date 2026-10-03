import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { deleteWorkSession, updateWorkSession } from "@/lib/services/workSessions";
import { updateWorkSessionSchema } from "@/lib/validation/workSession";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const parsed = updateWorkSessionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await updateWorkSession(auth.session.businessId, id, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await deleteWorkSession(auth.session.businessId, id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
