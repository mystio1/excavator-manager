import { errorResponse, failureResponse, type ServiceFailure } from "@/lib/api-error";
import { requireBusinessApi } from "@/lib/api-auth";
import { disableAppPin, setAppPin } from "@/lib/services/auth";
import { disableAppPinSchema, setAppPinSchema } from "@/lib/validation/auth";
import { json, parseBody, withApi } from "@/lib/with-api";

/** A wrong PIN stays a plain 400 (BAD_REQUEST) with the service's message; the
 * lock-out after too many wrong PINs is a 429 RATE_LIMITED carrying Retry-After
 * (the service reports how long to wait). */
function pinFailure(result: ServiceFailure & { retryAfterSec?: number }) {
  if (result.code === "RATE_LIMITED") {
    const wait = result.retryAfterSec && result.retryAfterSec > 0 ? Math.ceil(result.retryAfterSec) : 300;
    return errorResponse("RATE_LIMITED", result.error, {
      headers: { "Retry-After": String(wait) },
      details: { retryAfterSec: wait },
    });
  }
  return failureResponse(result);
}

export const POST = withApi("settings.app-pin.set", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  // A support impersonation session must not set a lock PIN the owner doesn't know.
  if (auth.session.supportSessionId) return errorResponse("FORBIDDEN", "This action is not available in a support session.");

  const input = await parseBody(req, setAppPinSchema);
  const result = await setAppPin(auth.session.userId, input.currentPin, input.newPin);
  if ("error" in result) return pinFailure(result);
  return json({ ok: true });
});

export const DELETE = withApi("settings.app-pin.disable", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  if (auth.session.supportSessionId) return errorResponse("FORBIDDEN", "This action is not available in a support session.");

  const input = await parseBody(req, disableAppPinSchema);
  const result = await disableAppPin(auth.session.userId, input.currentPin);
  if ("error" in result) return pinFailure(result);
  return json({ ok: true });
});
