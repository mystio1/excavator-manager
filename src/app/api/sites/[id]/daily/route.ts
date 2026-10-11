import { ApiHttpError } from "@/lib/api-error";
import { requireBusinessApi } from "@/lib/api-auth";
import { listDailyReadings } from "@/lib/services/siteAnalysis";
import { siteAnalysisQuerySchema } from "@/lib/validation/site";
import { json, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string }> };

/** Daily machine reading table (one row per day and machine), paginated: `?excavatorId=&from=&to=&page=&pageSize=`. */
export const GET = withApi("sites.daily", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;
  const query = siteAnalysisQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const result = await listDailyReadings(auth.session.businessId, id, query);
  if (!result) throw new ApiHttpError("NOT_FOUND", "Site not found");
  return json(result);
});
