import { requireBusinessApi } from "@/lib/api-auth";
import { verifyAppPin } from "@/lib/services/auth";
import { authFailureResponse } from "@/lib/signin-response";
import { json, parseBody, withApi } from "@/lib/with-api";
import { verifyAppPinSchema } from "@/lib/validation/auth";

/** The (app) layout's lock screen calls this — a valid session already
 * exists at this point (requireBusinessApi confirms that same as any other
 * route); this only gates whether the client reveals the dashboard. Wrong
 * guesses are throttled per user (see appPinRules); a correct PIN is never
 * counted against the budget. */
export const POST = withApi("auth.verifyPin", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const input = await parseBody(req, verifyAppPinSchema);

  const result = await verifyAppPin(auth.session.userId, input.pin);
  if ("error" in result) return authFailureResponse(result);

  return json({ ok: true });
});
