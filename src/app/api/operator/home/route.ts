import { requireOperatorApi } from "@/lib/api-auth";
import { getOperatorPortalState } from "@/lib/services/workSessions";
import {
  listOpenOperatorRequests,
  listRecentAdminWork,
  listRecentOperatorRequests,
} from "@/lib/services/operatorWorkRequests";
import { json, withApi } from "@/lib/with-api";

/** Backs the operator portal home page — mirrors what OperatorHomePage
 * fetches server-side: the assigned machine, any admin-started active
 * session, and (only when relevant, same as the page's own branching) the
 * operator's own open/recent job requests. */
export const GET = withApi("operator.home", async () => {
  const auth = await requireOperatorApi();
  if (auth.error) return auth.error;
  const { businessId, operatorId, operatorLang } = auth.session;

  const { excavator, activeSession, latestEndMeter } = await getOperatorPortalState(operatorId, businessId);
  if (!excavator || activeSession) {
    return json({ operatorLang, excavator, activeSession, latestEndMeter, openRequests: [], recentRequests: [] });
  }

  const [openRequests, ownRequests, adminWork] = await Promise.all([
    listOpenOperatorRequests(operatorId, excavator.id, businessId),
    listRecentOperatorRequests(operatorId, excavator.id, 5, businessId),
    listRecentAdminWork(operatorId, excavator.id, 5, businessId),
  ]);

  // Work the admin entered belongs in the operator's history beside their own,
  // newest first — it is their work either way.
  const recentRequests = [...ownRequests, ...adminWork]
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
    .slice(0, 5);

  return json({ operatorLang, excavator, activeSession, latestEndMeter, openRequests, recentRequests });
});
