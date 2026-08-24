import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { loginSchema } from "@/lib/validation/auth";

export async function POST(req: Request) {
  const parsed = loginSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  try {
    // redirect: false — signIn still sets the session cookie (same
    // underlying Auth() call as the redirecting form), it just returns a
    // URL string instead of throwing Next's redirect signal, which only
    // makes sense in a Server Action / page render, not a Route Handler.
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
