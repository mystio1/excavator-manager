import { requireOperatorApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { editOperatorWorkRequest } from "@/lib/services/operatorWorkRequests";
import { editOperatorWorkRequestSchema } from "@/lib/validation/operatorWorkRequest";
import { json, parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("operator.work.edit", async (req) => {
  const auth = await requireOperatorApi();
  if (auth.error) return auth.error;

  const input = await parseBody(req, editOperatorWorkRequestSchema);
  const result = await editOperatorWorkRequest(auth.session.businessId, auth.session.operatorId, auth.actor, input);
  if ("error" in result) return failureResponse(result);

  return json(result);
});
