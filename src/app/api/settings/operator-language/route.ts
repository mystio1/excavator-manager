import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { updateOperatorLanguage } from "@/lib/services/settings";
import { operatorLanguageSchema } from "@/lib/validation/settings";

export async function PATCH(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = operatorLanguageSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  await updateOperatorLanguage(auth.session.businessId, parsed.data.operatorLanguage);
  return NextResponse.json({ ok: true });
}
