import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { listWorkHistory, type WorkHistoryFilters } from "@/lib/services/workSessions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const { searchParams } = new URL(req.url);
  const filters: WorkHistoryFilters = {
    customerId: searchParams.get("customerId") ?? undefined,
    operatorId: searchParams.get("operatorId") ?? undefined,
    siteName: searchParams.get("site") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const history = await listWorkHistory(auth.session.businessId, id, filters);
  return NextResponse.json({ history });
}
