import { failureResponse } from "@/lib/api-error";
import { requireSupportApi } from "@/lib/supportTokens";
import { setBusinessLimits } from "@/lib/services/support";
import { supportLimitsSchema } from "@/lib/validation/support";
import { json, parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("support.limits", async (req) => {
  const auth = await requireSupportApi(req);
  if (auth.error) return auth.error;

  const input = await parseBody(req, supportLimitsSchema);

  const result = await setBusinessLimits(
    input.businessCode,
    { maxOperators: input.maxOperators, maxBillsPerDay: input.maxBillsPerDay },
    { supportSessionId: auth.session.id, reason: input.reason },
  );
  if ("error" in result) return failureResponse(result);

  return json({ business: result.business });
});
