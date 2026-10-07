import { errorResponse } from "@/lib/api-error";
import { getValidBusinessSession, getValidOperatorSession } from "@/lib/session";
import { setContextActor } from "@/lib/request-context";
import type { AuditActor } from "@/lib/audit";

const FROZEN_RESPONSE = () =>
  errorResponse(
    "ACCOUNT_FROZEN",
    "This account has been frozen by our support team. Your data is safe — contact support for recovery.",
    { details: { frozen: true } },
  );

const UNAUTHORIZED_RESPONSE = () => errorResponse("UNAUTHORIZED", "Please log in again.");

/**
 * API-route analogue of requireBusiness()/requireOperator() — those call
 * redirect(), which throws a signal meant for React rendering and has no
 * meaning inside a Route Handler, which must return a real Response. These
 * return a 401 JSON response instead, for the client-fetched pages/mutations
 * added for the Android app's bundled build.
 *
 * `allowFrozen` exists only for /api/layout — every business's client polls
 * it to render the shell, and it's how a frozen business's own client
 * learns it's frozen at all (see (app)/layout.tsx). Every other route
 * blocks outright (423) once support has frozen a business — this is
 * enforced here, not just as a frontend overlay, so it can't be bypassed by
 * a stale client.
 */
export async function requireBusinessApi(options?: { allowFrozen?: boolean }) {
  const session = await getValidBusinessSession();
  if (!session) {
    return { session: null, error: UNAUTHORIZED_RESPONSE() } as const;
  }
  if (session.businessFrozen && !options?.allowFrozen) {
    return { session: null, error: FROZEN_RESPONSE() } as const;
  }
  setContextActor({
    businessId: session.businessId,
    userId: session.userId,
    ...(session.supportSessionId ? { supportSessionId: session.supportSessionId, onBehalfOfUserId: session.userId } : {}),
  });
  // `actor` identifies who is changing data in the financial audit trail. While
  // support is impersonating an owner it is SUPPORT — never the owner — so the
  // owner can tell their own edits from support's (the support session id and
  // the impersonated account are added to every audit entry by recordAudit).
  const actor: AuditActor = session.supportSessionId
    ? { type: "SUPPORT", id: null, name: "Support (acting as the owner)" }
    : { type: "OWNER", id: session.userId, name: session.ownerName };
  return { session, actor, error: null } as const;
}

export async function requireOperatorApi(options?: { allowFrozen?: boolean }) {
  const session = await getValidOperatorSession();
  if (!session) {
    return { session: null, error: UNAUTHORIZED_RESPONSE() } as const;
  }
  if (session.businessFrozen && !options?.allowFrozen) {
    return { session: null, error: FROZEN_RESPONSE() } as const;
  }
  setContextActor({ businessId: session.businessId, userId: session.operatorId });
  // Operator-portal actions are attributed to the operator in the audit trail
  // (the display name is looked up by id when the trail is read).
  const actor: AuditActor = { type: "OPERATOR", id: session.operatorId, name: `operator:${session.operatorId}` };
  return { session, actor, error: null } as const;
}
