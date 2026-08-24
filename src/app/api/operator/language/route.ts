import { NextResponse } from "next/server";
import { requireOperatorApi } from "@/lib/api-auth";
import { updateOperatorOwnLanguage } from "@/lib/services/operators";
import { operatorLanguageSchema } from "@/lib/validation/settings";

export async function POST(req: Request) {
  const auth = await requireOperatorApi();
  if (auth.error) return auth.error;

  const parsed = operatorLanguageSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  await updateOperatorOwnLanguage(auth.session.operatorId, parsed.data.operatorLanguage);
  return NextResponse.json({ ok: true });
}
