import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import {
  getPreviousServiceSummary,
  getReplacementHistory,
  listComponentCatalog,
  listServiceHistory,
} from "@/lib/services/serviceRecords";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;
  const { businessId } = auth.session;

  const [catalogGroups, previousSummary, history, replacements] = await Promise.all([
    listComponentCatalog(businessId),
    getPreviousServiceSummary(businessId, id),
    listServiceHistory(businessId, id),
    getReplacementHistory(businessId, id),
  ]);

  return NextResponse.json({ catalogGroups, previousSummary, history, replacements });
}
