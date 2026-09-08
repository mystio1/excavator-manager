import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { loginSchema } from "@/lib/validation/auth";
import { isLoginBlockedByFrozenBusiness } from "@/lib/services/auth";

export async function POST(req: Request) {
  const parsed = loginSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  // Checked before the password, same order the support console uses
  // everywhere else (requireBusinessApi) — a frozen account can't even sign
  // in, rather than getting a session that's turned away on its first request.
  if (await isLoginBlockedByFrozenBusiness(parsed.data.identifier)) {
    return NextResponse.json(
      { error: "This account has been frozen by our support team. Your data is safe — contact support for recovery.", frozen: true },
      { status: 423 },
    );
  }

  try {
    // redirect: false — signIn still sets the session cookie (same
    // underlying Auth() call as the redirecting form), it just returns a
    // URL string instead of throwing Next's redirect signal, which only
    // makes sense in a Server Action / page render, not a Route Handler.
    await signIn("credentials", { identifier: parsed.data.identifier, password: parsed.data.password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Wrong email/phone or password" }, { status: 401 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
