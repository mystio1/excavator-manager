import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { setOperatorPin } from "@/lib/services/operators";
import { setOperatorPinSchema } from "@/lib/validation/operator";
import { json, parseBody, withApi } from "@/lib/with-api";

/** Admin enables/disables portal login and optionally sets or resets the PIN
 * (4-8 digits). Setting/resetting a PIN or disabling login invalidates the
 * operator's existing sessions. */
export const PATCH = withApi("operators.pin", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await parseBody(req, setOperatorPinSchema);
  const result = await setOperatorPin(auth.session.businessId, auth.actor, id, {
    canLogin: body.canLogin,
    pin: body.pin || undefined,
    expectedVersion: body.expectedVersion,
  });
  if ("error" in result) return failureResponse(result);
  return json({ ok: true, version: result.version });
});
