import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { approveWorkRequest } from "@/lib/services/operatorWorkRequests";
import { approveWorkRequestBodySchema } from "@/lib/validation/operatorWorkRequest";
import { json, parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("workRequest.approve", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  // The request always comes from the URL, never the body.
  const body = await parseBody(req, approveWorkRequestBodySchema);
  const result = await approveWorkRequest(auth.session.businessId, auth.actor, { ...body, requestId: id });
  if ("error" in result) return failureResponse(result);

  return json(result);
});
