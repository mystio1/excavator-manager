import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { PIN_RATE_LIMIT_MESSAGE, verifyAppPin } from "@/lib/services/auth";
import { verifyAppPinSchema } from "@/lib/validation/auth";

/** The (app) layout's lock screen calls this — a valid session already
 * exists at this point (requireBusinessApi confirms that same as any other
 * route); this only gates whether the client reveals the dashboard. */
export async function POST(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = verifyAppPinSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter your PIN" }, { status: 400 });
  }

  const result = await verifyAppPin(auth.session.userId, parsed.data.pin);
  if ("error" in result) {
    const status = result.error === PIN_RATE_LIMIT_MESSAGE ? 429 : 401;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
