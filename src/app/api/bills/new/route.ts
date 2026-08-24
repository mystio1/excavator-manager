import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { listCustomerOptions } from "@/lib/services/customers";
import { listSiteOptions } from "@/lib/services/sites";
import { listExcavatorOptions } from "@/lib/services/excavators";
import { listBankAccounts, getBusinessSettings } from "@/lib/services/settings";
import { listUnbilledWorkSessions, previewNextNonGstBillNumber } from "@/lib/services/bills";

export async function GET(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId") ?? undefined;

  const [customers, sites, excavators] = await Promise.all([
    listCustomerOptions(businessId),
    listSiteOptions(businessId),
    listExcavatorOptions(businessId),
  ]);

  if (!customerId) {
    return NextResponse.json({ customers, sites, excavators });
  }

  const siteId = searchParams.get("siteId") ?? undefined;
  const excavatorId = searchParams.get("excavatorId") ?? undefined;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  const [sessions, bankAccounts, business, nextNonGstNumber] = await Promise.all([
    listUnbilledWorkSessions(businessId, customerId, { siteId, excavatorId, from, to }),
    listBankAccounts(businessId),
    getBusinessSettings(businessId),
    previewNextNonGstBillNumber(businessId),
  ]);
  const customer = customers.find((c) => c.id === customerId);

  return NextResponse.json({
    customers,
    sites,
    excavators,
    sessions: sessions.map((s) => ({
      id: s.id,
      excavatorName: s.excavator.name,
      machineNumber: s.excavator.machineNumber,
      siteName: s.site.name,
      startDate: s.startDate,
      endDate: s.endDate ?? s.startDate,
      totalHours: s.totalHours,
    })),
    bankAccounts,
    businessGstNumber: business.gstNumber,
    nextNonGstNumber,
    customerName: customer?.name ?? "",
  });
}
