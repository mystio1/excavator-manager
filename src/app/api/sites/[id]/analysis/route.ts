import { ApiHttpError } from "@/lib/api-error";
import { requireBusinessApi } from "@/lib/api-auth";
import { getSiteAnalysis } from "@/lib/services/siteAnalysis";
import { siteAnalysisQuerySchema } from "@/lib/validation/site";
import { json, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string }> };

/** Site summary, machine-wise table, work-type and diesel analysis for `?from=&to=&excavatorId=`. */
export const GET = withApi("sites.analysis", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;
  const { excavatorId, from, to } = siteAnalysisQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const analysis = await getSiteAnalysis(auth.session.businessId, id, { excavatorId, from, to });
  if (!analysis) throw new ApiHttpError("NOT_FOUND", "Site not found");
  return json(analysis);
});
