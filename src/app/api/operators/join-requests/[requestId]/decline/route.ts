import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { declineJoinRequest } from "@/lib/services/operators";
import { json, withApi } from "@/lib/with-api";

export const POST = withApi(
  "operators.joinRequests.decline",
  async (_req, { params }: { params: Promise<{ requestId: string }> }) => {
    const auth = await requireBusinessApi();
    if (auth.error) return auth.error;
    const { requestId } = await params;

    const result = await declineJoinRequest(auth.session.businessId, auth.actor, requestId);
    if ("error" in result) return failureResponse(result);
    return json({ ok: true });
  },
);
