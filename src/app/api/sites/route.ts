import { failureResponse } from "@/lib/api-error";
import { requireBusinessApi } from "@/lib/api-auth";
import { listSites } from "@/lib/services/siteAnalysis";
import { createSite } from "@/lib/services/sites";
import { createSiteSchema, siteListQuerySchema } from "@/lib/validation/site";
import { json, parseBody, withApi } from "@/lib/with-api";

/** Site Analysis list: `?q=&type=CUSTOMER_SITE|SELF_SITE&status=&excavatorId=&from=&to=&page=&pageSize=`
 * -> `{ sites, page, pageSize, total, totalPages, summary }`. Filtering, aggregation and paging run in the database. */
export const GET = withApi("sites.list", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const query = siteListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json(await listSites(auth.session.businessId, query));
});

export const POST = withApi("sites.create", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const input = await parseBody(req, createSiteSchema);
  const result = await createSite(auth.session.businessId, auth.actor, input);
  if ("error" in result) return failureResponse(result);
  return json({ ok: true, site: result.site });
});
