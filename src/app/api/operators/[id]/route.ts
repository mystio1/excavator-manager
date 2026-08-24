import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { archiveOperator } from "@/lib/services/operators";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  await archiveOperator(auth.session.businessId, id);
  return NextResponse.json({ ok: true });
}
