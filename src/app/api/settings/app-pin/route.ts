import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { disableAppPin, PIN_RATE_LIMIT_MESSAGE, setAppPin } from "@/lib/services/auth";
import { disableAppPinSchema, setAppPinSchema } from "@/lib/validation/auth";

export async function POST(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = setAppPinSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await setAppPin(auth.session.userId, parsed.data.currentPin, parsed.data.newPin);
  if ("error" in result) {
    const status = result.error === PIN_RATE_LIMIT_MESSAGE ? 429 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = disableAppPinSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await disableAppPin(auth.session.userId, parsed.data.currentPin);
  if ("error" in result) {
    const status = result.error === PIN_RATE_LIMIT_MESSAGE ? 429 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
