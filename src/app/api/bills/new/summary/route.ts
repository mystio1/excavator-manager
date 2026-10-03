import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { listCustomerOptions } from "@/lib/services/customers";
import { listSiteOptions } from "@/lib/services/sites";
import { listExcavatorOptions } from "@/lib/services/excavators";
import { listBankAccounts, getBusinessSettings } from "@/lib/services/settings";
import { previewNextNonGstBillNumber } from "@/lib/services/bills";

/** Everything the Summary Bill / Edit Bill form needs in a single round
 * trip, so the page is interactive the moment it renders. */
export async function GET() {
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

  return NextResponse.json({
    customers,
    sites,
    excavators,
    bankAccounts,
    businessGstNumber: business.gstNumber,
    nextNonGstNumber,
  });
}
