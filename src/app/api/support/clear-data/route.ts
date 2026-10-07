import { errorResponse, failureResponse } from "@/lib/api-error";
import { requireSupportApi } from "@/lib/supportTokens";
import { clearBusinessData } from "@/lib/services/support";
import { supportClearDataSchema } from "@/lib/validation/support";
import { json, parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("support.clearData", async (req) => {
  const auth = await requireSupportApi(req);
  if (auth.error) return auth.error;

  const input = await parseBody(req, supportClearDataSchema);

  // The confirmation the client collected from whoever's driving the
  // console — checked again here, not just in the UI, since this deletes
  // real business data with no undo.
  if (input.confirmCode.trim().toUpperCase() !== input.businessCode.trim().toUpperCase()) {
    return errorResponse("BAD_REQUEST", "Confirmation code doesn't match the business code");
  }

  const result = await clearBusinessData(input.businessCode, {
    supportSessionId: auth.session.id,
    reason: input.reason,
  });
  if ("error" in result) return failureResponse(result);

  return json({ business: result.business, counts: result.counts });
});
