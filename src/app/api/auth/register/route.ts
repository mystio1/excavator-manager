import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { registerBusiness } from "@/lib/services/auth";
import { registerSchema } from "@/lib/validation/auth";

export async function POST(req: Request) {
  const parsed = registerSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await registerBusiness(parsed.data);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Account created — please log in" }, { status: 401 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
