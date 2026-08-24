import { NextResponse } from "next/server";
import { requireOperatorApi } from "@/lib/api-auth";
import { getOperatorPortalState } from "@/lib/services/workSessions";
import { listOpenOperatorRequests, listRecentOperatorRequests } from "@/lib/services/operatorWorkRequests";

/** Backs the operator portal home page — mirrors what OperatorHomePage
 * fetches server-side: the assigned machine, any admin-started active
 * session, and (only when relevant, same as the page's own branching) the
 * operator's own open/recent job requests. */
export async function GET() {
  const auth = await requireOperatorApi();
  if (auth.error) return auth.error;
  const { operatorId, operatorLang } = auth.session;

  const { excavator, activeSession } = await getOperatorPortalState(operatorId);
  if (!excavator || activeSession) {
    return NextResponse.json({ operatorLang, excavator, activeSession, openRequests: [], recentRequests: [] });
  }

  const [openRequests, recentRequests] = await Promise.all([
    listOpenOperatorRequests(operatorId, excavator.id),
    listRecentOperatorRequests(operatorId, excavator.id, 5),
  ]);

  return NextResponse.json({ operatorLang, excavator, activeSession, openRequests, recentRequests });
}
