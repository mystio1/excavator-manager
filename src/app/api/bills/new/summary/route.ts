import { requireBusinessApi } from "@/lib/api-auth";
import { listCustomerOptions } from "@/lib/services/customers";
import { listSiteOptions } from "@/lib/services/sites";
import { listExcavatorOptions } from "@/lib/services/excavators";
import { listBankAccounts, getBusinessSettings } from "@/lib/services/settings";
import { previewNextNonGstBillNumber } from "@/lib/services/bills";
import { json, withApi } from "@/lib/with-api";

/** Everything the Summary Bill / Edit Bill form needs in a single round
 * trip, so the page is interactive the moment it renders. */
export const GET = withApi("bills.new-summary-form", async () => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const [customers, sites, excavators, bankAccounts, business, nextNonGstNumber] = await Promise.all([
    listCustomerOptions(businessId),
    listSiteOptions(businessId),
    listExcavatorOptions(businessId),
    listBankAccounts(businessId),
    getBusinessSettings(businessId),
    previewNextNonGstBillNumber(businessId),
  ]);

  return json({
    customers,
    sites,
    excavators,
    bankAccounts,
    businessGstNumber: business.gstNumber,
    nextNonGstNumber,
  });
});
