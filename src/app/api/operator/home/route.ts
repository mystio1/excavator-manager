import { requireOperatorApi } from "@/lib/api-auth";
import { getOperatorPortalState } from "@/lib/services/workSessions";
import { listOpenOperatorRequests, listRecentOperatorRequests } from "@/lib/services/operatorWorkRequests";
import { json, withApi } from "@/lib/with-api";

/** Backs the operator portal home page — mirrors what OperatorHomePage
 * fetches server-side: the assigned machine, any admin-started active
 * session, and (only when relevant, same as the page's own branching) the
 * operator's own open/recent job requests. */
export const GET = withApi("operator.home", async () => {
  const auth = await requireOperatorApi();
  if (auth.error) return auth.error;
  const { businessId, operatorId, operatorLang } = auth.session;

  const { excavator, activeSession } = await getOperatorPortalState(operatorId, businessId);
  if (!excavator || activeSession) {
    return json({ operatorLang, excavator, activeSession, openRequests: [], recentRequests: [] });
  }

  const [openRequests, recentRequests] = await Promise.all([
    listOpenOperatorRequests(operatorId, excavator.id, businessId),
    listRecentOperatorRequests(operatorId, excavator.id, 5, businessId),
  ]);

  return json({ operatorLang, excavator, activeSession, openRequests, recentRequests });
});
