import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { assignOperator, endOperatorAssignment } from "@/lib/services/operatorAssignments";
import { assignOperatorSchema } from "@/lib/validation/operatorAssignment";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const parsed = assignOperatorSchema.safeParse({ ...(await req.json()), excavatorId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await assignOperator(auth.session.businessId, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  await endOperatorAssignment(auth.session.businessId, id);
  return NextResponse.json({ ok: true });
}
