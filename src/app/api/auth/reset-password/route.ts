import { failureResponse } from "@/lib/api-error";
import { enforceAuthLimits, resetPasswordRules } from "@/lib/auth-throttle";
import { clientIp } from "@/lib/rateLimit";
import { resetPassword } from "@/lib/services/auth";
import { json, parseBody, withApi } from "@/lib/with-api";
import { resetPasswordSchema } from "@/lib/validation/auth";

export const POST = withApi("auth.resetPassword", async (req) => {
  const input = await parseBody(req, resetPasswordSchema);
  await enforceAuthLimits(resetPasswordRules(clientIp(req)));

  const result = await resetPassword(input.token, input.password);
  if ("error" in result) return failureResponse(result);

  return json({ ok: true });
});
