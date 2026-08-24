import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { archiveBankAccount } from "@/lib/services/settings";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  await archiveBankAccount(auth.session.businessId, id);
  return NextResponse.json({ ok: true });
}
