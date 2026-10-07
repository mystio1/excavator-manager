import { failureResponse } from "@/lib/api-error";
import { requireSupportApi } from "@/lib/supportTokens";
import { setBusinessFrozen } from "@/lib/services/support";
import { supportFreezeSchema } from "@/lib/validation/support";
import { json, parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("support.freeze", async (req) => {
  const auth = await requireSupportApi(req);
  if (auth.error) return auth.error;

  const input = await parseBody(req, supportFreezeSchema);

  const result = await setBusinessFrozen(input.businessCode, input.frozen, {
    supportSessionId: auth.session.id,
    reason: input.reason,
  });
  if ("error" in result) return failureResponse(result);

  return json({ business: result.business });
});
