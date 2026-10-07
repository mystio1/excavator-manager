import { after } from "next/server";
import { enforceAuthLimits, forgotPasswordRules } from "@/lib/auth-throttle";
import { clientIp } from "@/lib/rateLimit";
import { requestPasswordResetQuietly } from "@/lib/services/auth";
import { json, parseBody, withApi } from "@/lib/with-api";
import { forgotPasswordSchema } from "@/lib/validation/auth";

/** Runs `task` once the response has been sent. Outside a Next request scope
 * (unit tests, scripts) `after()` is unavailable and the task just runs in the
 * background instead. */
function runAfterResponse(task: () => Promise<void>) {
  try {
    after(task);
  } catch {
    void task();
  }
}

export const POST = withApi("auth.forgotPassword", async (req) => {
  const input = await parseBody(req, forgotPasswordSchema);
  await enforceAuthLimits(forgotPasswordRules(clientIp(req), input.email));

  // Identical response whether or not the email is registered — AND identical
  // timing: the lookup, token write and email send all happen after the
  // response has gone out, so nothing about how long this call took reveals
  // whether an account exists. The link in the email is built from APP_URL
  // (config), never from this request's Host header.
  runAfterResponse(() => requestPasswordResetQuietly(input.email));

  return json({ submitted: true });
});
