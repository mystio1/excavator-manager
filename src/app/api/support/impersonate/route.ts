import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { requireSupportApi } from "@/lib/supportTokens";
import { findImpersonationTarget } from "@/lib/services/support";

export async function POST(req: Request) {
  const auth = requireSupportApi(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const businessCode = typeof body?.businessCode === "string" ? body.businessCode : "";

  const target = await findImpersonationTarget(businessCode);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: 404 });

  try {
    // Real session, same as a normal login — the rest of the app needs no
    // special-casing to work once support is "in" as this owner. The
    // support-impersonate provider re-checks the token itself (auth.ts),
    // so this can't be used to sign in as anyone without one.
    await signIn("support-impersonate", { userId: target.owner.id, supportToken: auth.token, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Could not access this business" }, { status: 401 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
