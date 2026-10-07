import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";
import {
  createOperator,
  getOperatorRankingLast45Days,
  listOperatorsPage,
  listPendingJoinRequests,
} from "@/lib/services/operators";
import { getLifetimeSalaryBreakdown } from "@/lib/services/salary";
import { countPendingLogs } from "@/lib/services/workSessions";
import { countPendingWorkRequests } from "@/lib/services/operatorWorkRequests";
import { addOperatorSchema } from "@/lib/validation/operator";
import { json, parseBody, withApi } from "@/lib/with-api";

/** Backs the client-rendered operators page used by the Android bundled
 * build — same 6-way parallel batch the server-rendered web page fetches
 * directly.
 *
 * `?limit=&cursor=` pages the operator list (no `limit` = bounded legacy page of
 * 200; installed apps ignore `nextCursor`). A request WITH a cursor is a
 * "Load more" and returns only the next slice of operators — the counts,
 * ranking and join requests are not recomputed for it. */
export const GET = withApi("operators.list", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;
  const page = parsePagination(req);

  if (page.cursor) {
    const [{ operators: rawOperators, nextCursor }, salaryBreakdown] = await Promise.all([
      listOperatorsPage(businessId, page),
      getLifetimeSalaryBreakdown(businessId),
    ]);
    const remainingByOperator = new Map(salaryBreakdown.map((s) => [s.operatorId, s.remaining]));
    const operators = rawOperators.map((op) => ({ ...op, remainingSalary: remainingByOperator.get(op.id) ?? 0 }));
    return json({ operators, nextCursor });
  }

  const [{ operators: rawOperators, nextCursor }, pendingLogCount, pendingWorkRequestCount, joinRequests, ranking, salaryBreakdown] =
    await Promise.all([
      listOperatorsPage(businessId, page),
      countPendingLogs(businessId),
      countPendingWorkRequests(businessId),
      listPendingJoinRequests(businessId),
      getOperatorRankingLast45Days(businessId),
      getLifetimeSalaryBreakdown(businessId),
    ]);

  const remainingByOperator = new Map(salaryBreakdown.map((s) => [s.operatorId, s.remaining]));
  const operators = rawOperators.map((op) => ({ ...op, remainingSalary: remainingByOperator.get(op.id) ?? 0 }));

  return json({ operators, pendingLogCount, pendingWorkRequestCount, joinRequests, ranking, nextCursor });
});

export const POST = withApi("operators.create", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const input = await parseBody(req, addOperatorSchema);
  const result = await createOperator(auth.session.businessId, auth.actor, input);
  if ("error" in result) return failureResponse(result);
  return json({ operator: result.operator });
});
