import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { listSiteAnalysisReadings } from "@/lib/services/operatorWorkRequests";
import { listSiteOptions } from "@/lib/services/sites";
import { listCustomerOptions } from "@/lib/services/customers";

export async function GET() {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const [readings, siteOptions, customerOptions] = await Promise.all([
    listSiteAnalysisReadings(businessId),
    listSiteOptions(businessId),
    listCustomerOptions(businessId),
  ]);

  return NextResponse.json({ readings, siteOptions, customerOptions });
}
