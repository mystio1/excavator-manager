import { AuthError } from "next-auth";
import { errorResponse, failureResponse } from "@/lib/api-error";
import { signIn } from "@/lib/auth";
import { enforceAuthLimits, registerRules } from "@/lib/auth-throttle";
import { clientIp } from "@/lib/rateLimit";
import { registerBusiness } from "@/lib/services/auth";
import { assertSignedIn } from "@/lib/signin-response";
import { json, parseBody, withApi } from "@/lib/with-api";
import { registerSchema } from "@/lib/validation/auth";

export const POST = withApi("auth.register", async (req) => {
  const input = await parseBody(req, registerSchema);

  // Creating accounts is the other thing worth throttling per source:
  // 5 per hour per IP (every attempt counts, successful or not).
  await enforceAuthLimits(registerRules(clientIp(req)));

  const result = await registerBusiness(input);
  if ("error" in result) return failureResponse(result);

  try {
    assertSignedIn(await signIn("credentials", { identifier: input.email, password: input.password, redirect: false }));
  } catch (error) {
    // The account exists now; if the automatic sign-in can't complete (any
    // reason, throttling included) send them to the login form.
    if (error instanceof AuthError) return errorResponse("UNAUTHORIZED", "Account created — please log in");
    throw error;
  }

  return json({ ok: true });
});
