import { ApiHttpError } from "@/lib/api-error";
import { requireBusinessApi } from "@/lib/api-auth";
import { listDieselEntries } from "@/lib/services/siteAnalysis";
import { siteAnalysisQuerySchema } from "@/lib/validation/site";
import { json, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string }> };

/** Individual diesel entries (approved daily logs + session-level diesel), paginated, with totals that reconcile. */
export const GET = withApi("sites.diesel", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;
  const query = siteAnalysisQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const result = await listDieselEntries(auth.session.businessId, id, query);
  if (!result) throw new ApiHttpError("NOT_FOUND", "Site not found");
  return json(result);
});
