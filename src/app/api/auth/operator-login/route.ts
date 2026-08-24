import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { operatorLoginSchema } from "@/lib/validation/auth";

export async function POST(req: Request) {
  const parsed = operatorLoginSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  try {
    await signIn("operator", { mobile: parsed.data.mobile, pin: parsed.data.pin, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Wrong mobile number or PIN" }, { status: 401 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
