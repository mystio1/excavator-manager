import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { rejectWorkRequest } from "@/lib/services/operatorWorkRequests";
import { rejectWorkRequestBodySchema } from "@/lib/validation/operatorWorkRequest";
import { json, parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("workRequest.reject", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await parseBody(req, rejectWorkRequestBodySchema);
  const result = await rejectWorkRequest(auth.session.businessId, auth.actor, { ...body, requestId: id });
  if ("error" in result) return failureResponse(result);

  return json(result);
});
