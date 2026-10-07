import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { assertSignedIn, signInFailureResponse } from "@/lib/signin-response";
import { json, parseBody, withApi } from "@/lib/with-api";
import { operatorLoginSchema } from "@/lib/validation/auth";

/** Operator login (mobile + PIN). A PIN is only 4+ digits, so the provider
 * (authenticateOperator) throttles hard per mobile number as well as per IP —
 * see operatorLoginRules. Wrong PIN and unknown mobile give the same 401. */
export const POST = withApi("auth.operatorLogin", async (req) => {
  const input = await parseBody(req, operatorLoginSchema);

  try {
    assertSignedIn(await signIn("operator", { mobile: input.mobile, pin: input.pin, redirect: false }));
  } catch (error) {
    if (error instanceof AuthError) return signInFailureResponse(error, "Wrong mobile number or PIN");
    throw error;
  }

  return json({ ok: true });
});
