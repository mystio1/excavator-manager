import { failureResponse } from "@/lib/api-error";
import { requireBusinessApi } from "@/lib/api-auth";
import { regenerateBusinessCode } from "@/lib/services/settings";
import { regenerateBusinessCodeSchema } from "@/lib/validation/settings";
import { json, parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("settings.business-code.regenerate", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const { customCode } = await parseBody(req, regenerateBusinessCodeSchema);
  const result = await regenerateBusinessCode(auth.session.businessId, auth.actor, customCode);
  if ("error" in result) return failureResponse(result);
  return json(result);
});
