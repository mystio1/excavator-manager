import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { addBankAccount } from "@/lib/services/settings";
import { bankAccountSchema } from "@/lib/validation/settings";

export async function POST(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = bankAccountSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  await addBankAccount(auth.session.businessId, parsed.data);
  return NextResponse.json({ ok: true });
}
