import { requireBusinessApi } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-error";
import { excavatorInBusiness } from "@/lib/services/excavators";
import { json, withApi } from "@/lib/with-api";
import {
  getPreviousServiceSummary,
  getReplacementHistory,
  listComponentCatalog,
  listServiceHistory,
} from "@/lib/services/serviceRecords";

export const GET = withApi("excavators.serviceTab", async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;
  const { businessId } = auth.session;
  if (!(await excavatorInBusiness(businessId, id))) return errorResponse("NOT_FOUND", "Machine not found");

  const [catalogGroups, previousSummary, history, replacements] = await Promise.all([
    listComponentCatalog(businessId),
    getPreviousServiceSummary(businessId, id),
    listServiceHistory(businessId, id),
    getReplacementHistory(businessId, id),
  ]);

  return json({ catalogGroups, previousSummary, history, replacements });
});
