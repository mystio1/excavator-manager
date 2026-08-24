import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { setOperatorPin } from "@/lib/services/operators";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  await setOperatorPin(auth.session.businessId, id, { canLogin: false });
  return NextResponse.json({ ok: true });
}
