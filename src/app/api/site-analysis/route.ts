import { requireBusinessApi } from "@/lib/api-auth";
import { listSiteAnalysisReadings } from "@/lib/services/operatorWorkRequests";
import { listSiteOptions } from "@/lib/services/sites";
import { listCustomerOptions } from "@/lib/services/customers";
import { json, withApi } from "@/lib/with-api";

export const GET = withApi("site-analysis.get", async () => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const [readings, siteOptions, customerOptions] = await Promise.all([
    listSiteAnalysisReadings(businessId),
    listSiteOptions(businessId),
    listCustomerOptions(businessId),
  ]);

  return json({ readings, siteOptions, customerOptions });
});
