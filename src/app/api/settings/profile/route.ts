import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { updateBusinessProfile } from "@/lib/services/settings";
import { businessProfileSchema } from "@/lib/validation/settings";

export async function PATCH(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = businessProfileSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  await updateBusinessProfile(auth.session.businessId, parsed.data);
  return NextResponse.json({ ok: true });
}
