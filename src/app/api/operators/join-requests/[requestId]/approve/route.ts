import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { approveJoinRequest } from "@/lib/services/operators";
import { approveJoinRequestSchema } from "@/lib/validation/operator";
import { json, parseBody, withApi } from "@/lib/with-api";

/** Body `{ code }`: the 6-digit verification code the operator was shown after
 * requesting to join (omit/empty only for legacy requests with no code).
 * 422 VALIDATION_FAILED = wrong code (the message says how many attempts are
 * left), 409 CONFLICT = expired / locked / already decided. */
export const POST = withApi(
  "operators.joinRequests.approve",
  async (req, { params }: { params: Promise<{ requestId: string }> }) => {
    const auth = await requireBusinessApi();
    if (auth.error) return auth.error;
    const { requestId } = await params;

    const body = await parseBody(req, approveJoinRequestSchema);
    const result = await approveJoinRequest(auth.session.businessId, auth.actor, requestId, body.code || undefined);
    if ("error" in result) return failureResponse(result);
    return json({ ok: true, createdOperator: result.createdOperator, operator: result.operator });
  },
);
