import { requireBusinessApi } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-error";
import { excavatorInBusiness } from "@/lib/services/excavators";
import { json, withApi } from "@/lib/with-api";
import { parsePagination } from "@/lib/pagination";
import { listWorkHistory, type WorkHistoryFilters } from "@/lib/services/workSessions";

/** GET ?customerId=&operatorId=&site=&from=&to=&limit=&cursor=
 * returns { history: [...], nextCursor }. Older apps send no limit and ignore
 * nextCursor; they get one bounded page. */
export const GET = withApi("excavators.workHistory", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!(await excavatorInBusiness(auth.session.businessId, id))) return errorResponse("NOT_FOUND", "Machine not found");

  const { searchParams } = new URL(req.url);
  const filters: WorkHistoryFilters = {
    customerId: searchParams.get("customerId") ?? undefined,
    operatorId: searchParams.get("operatorId") ?? undefined,
    siteName: searchParams.get("site") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const { history, nextCursor } = await listWorkHistory(auth.session.businessId, id, filters, parsePagination(req));
  return json({ history, nextCursor });
});
