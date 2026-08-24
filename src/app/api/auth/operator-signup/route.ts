import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { requestOperatorJoin } from "@/lib/services/operators";
import { operatorSignupSchema } from "@/lib/validation/operator";

export async function POST(req: Request) {
  const parsed = operatorSignupSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await requestOperatorJoin(
    parsed.data.businessCode,
    parsed.data.name,
    parsed.data.mobile,
    parsed.data.pin,
  );
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  // Only a leftover pre-approved (legacy invite) row logs straight in — a
  // fresh join request stays canLogin=false until the Admin approves it.
  if (result.status === "PENDING") {
    return NextResponse.json({
      success: true,
      message: "Request submitted! Ask your admin to approve your account, then log in below.",
    });
  }

  try {
    await signIn("operator", { mobile: parsed.data.mobile, pin: parsed.data.pin, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: true, message: "Account activated — please log in below." });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
