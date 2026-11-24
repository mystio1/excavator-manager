import { requireBusinessApi } from "@/lib/api-auth";
import { getFleetBySite } from "@/lib/services/siteAnalysis";
import { json, withApi } from "@/lib/with-api";

/** How many of the business's machines are at each site (and which), plus machines at none. */
export const GET = withApi("sites.fleet", async () => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  return json(await getFleetBySite(auth.session.businessId));
});
