import { requireBusinessApi } from "@/lib/api-auth";
import { listSiteOptions } from "@/lib/services/sites";
import { json, withApi } from "@/lib/with-api";

/** Complete site list for dropdowns and site→customer defaulting, each row
 * carrying the customer that site belongs to. The paginated, filterable Site
 * Analysis list is GET /api/sites. */
export const GET = withApi("sites.options", async () => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  return json({ sites: await listSiteOptions(auth.session.businessId) });
});
