import { NextResponse } from "next/server";
import { resetPassword } from "@/lib/services/auth";
import { resetPasswordSchema } from "@/lib/validation/auth";

export async function POST(req: Request) {
  const parsed = resetPasswordSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await resetPassword(parsed.data.token, parsed.data.password);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}
