import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { createOperator, getOperatorRankingLast45Days, listOperators, listPendingJoinRequests } from "@/lib/services/operators";
import { countPendingLogs } from "@/lib/services/workSessions";
import { countPendingWorkRequests } from "@/lib/services/operatorWorkRequests";
import { addOperatorSchema } from "@/lib/validation/operator";

/** Backs the client-rendered operators page used by the Android bundled
 * build — same 5-way parallel batch the server-rendered web page fetches
 * directly. */
export async function GET() {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const [operators, pendingLogCount, pendingWorkRequestCount, joinRequests, ranking] = await Promise.all([
    listOperators(businessId),
    countPendingLogs(businessId),
    countPendingWorkRequests(businessId),
    listPendingJoinRequests(businessId),
    getOperatorRankingLast45Days(businessId),
  ]);

  return NextResponse.json({ operators, pendingLogCount, pendingWorkRequestCount, joinRequests, ranking });
}

export async function POST(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = addOperatorSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const operator = await createOperator(auth.session.businessId, parsed.data);
  return NextResponse.json({ operator });
}
