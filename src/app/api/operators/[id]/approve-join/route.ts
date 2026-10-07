import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { approveJoinRequestLegacy } from "@/lib/services/operators";
import { json, withApi } from "@/lib/with-api";

/** Kept for installed apps whose admin UI predates verification codes. `id` is
 * an operator id (or a join-request id — the current list returns those). Only
 * code-less legacy requests can be approved here; a coded request answers 409
 * telling the admin to update the app or use the web app. New clients use
 * POST /api/operators/join-requests/[requestId]/approve. */
export const POST = withApi("operators.approveJoinLegacy", async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await approveJoinRequestLegacy(auth.session.businessId, auth.actor, id);
  if ("error" in result) return failureResponse(result);
  return json({ ok: true });
});
