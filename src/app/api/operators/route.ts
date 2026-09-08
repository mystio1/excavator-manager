import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { createOperator, getOperatorRankingLast45Days, listOperators, listPendingJoinRequests } from "@/lib/services/operators";
import { getLifetimeSalaryBreakdown } from "@/lib/services/salary";
import { countPendingLogs } from "@/lib/services/workSessions";
import { countPendingWorkRequests } from "@/lib/services/operatorWorkRequests";
import { addOperatorSchema } from "@/lib/validation/operator";

/** Backs the client-rendered operators page used by the Android bundled
 * build — same 6-way parallel batch the server-rendered web page fetches
 * directly. */
export async function GET() {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const [rawOperators, pendingLogCount, pendingWorkRequestCount, joinRequests, ranking, salaryBreakdown] = await Promise.all([
    listOperators(businessId),
    countPendingLogs(businessId),
    countPendingWorkRequests(businessId),
    listPendingJoinRequests(businessId),
    getOperatorRankingLast45Days(businessId),
    getLifetimeSalaryBreakdown(businessId),
  ]);

  const remainingByOperator = new Map(salaryBreakdown.map((s) => [s.operatorId, s.remaining]));
  const operators = rawOperators.map((op) => ({ ...op, remainingSalary: remainingByOperator.get(op.id) ?? 0 }));

  return NextResponse.json({ operators, pendingLogCount, pendingWorkRequestCount, joinRequests, ranking });
}

export async function POST(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = addOperatorSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await createOperator(auth.session.businessId, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ operator: result.operator });
}
