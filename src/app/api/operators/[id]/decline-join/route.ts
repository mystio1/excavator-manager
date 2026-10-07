import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { declineJoinRequestLegacy } from "@/lib/services/operators";
import { json, withApi } from "@/lib/with-api";

/** Kept for installed apps whose admin UI predates verification codes. `id` is
 * an operator id (or a join-request id). New clients use
 * POST /api/operators/join-requests/[requestId]/decline. */
export const POST = withApi("operators.declineJoinLegacy", async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await declineJoinRequestLegacy(auth.session.businessId, auth.actor, id);
  if ("error" in result) return failureResponse(result);
  return json({ ok: true });
});
