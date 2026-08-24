import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { setOperatorPin } from "@/lib/services/operators";
import { setOperatorPinSchema } from "@/lib/validation/operator";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;
  const { businessId } = auth.session;

  const body = await req.json();
  const canLogin: boolean = body.canLogin;

  if (!canLogin) {
    await setOperatorPin(businessId, id, { canLogin: false });
    return NextResponse.json({ ok: true });
  }

  const parsed = setOperatorPinSchema.safeParse({ pin: body.pin || undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the PIN" }, { status: 400 });
  }

  await setOperatorPin(businessId, id, { canLogin: true, pin: parsed.data.pin || undefined });
  return NextResponse.json({ ok: true });
}
