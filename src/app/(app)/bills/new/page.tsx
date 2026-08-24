import { requireBusiness } from "@/lib/session";
import { listCustomerOptions } from "@/lib/services/customers";
import { listSiteOptions } from "@/lib/services/sites";
import { listExcavatorOptions } from "@/lib/services/excavators";
import { listBankAccounts, getBusinessSettings } from "@/lib/services/settings";
import { listUnbilledWorkSessions, previewNextNonGstBillNumber } from "@/lib/services/bills";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GenerateBillForm } from "./generate-bill-form";

export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; siteId?: string; excavatorId?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await requireBusiness();
  const { customerId, siteId, excavatorId, from, to } = await searchParams;
  const [customers, sites, excavators] = await Promise.all([
    listCustomerOptions(businessId),
    listSiteOptions(businessId),
    listExcavatorOptions(businessId),
  ]);

  if (!customerId) {
    return (
      <div>
        <PageHeader title="Generate Bill" backHref="/bills" />
        <div className="px-4 pb-6 md:px-8">
          <Card>
            <CardContent>
              <form method="get" className="flex flex-col gap-4">
                <div>
                  <p className="mb-2 text-base font-semibold">Select Customer</p>
                  {customers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Add a customer first.</p>
                  ) : (
                    <NativeSelect name="customerId" required defaultValue="">
                      <option value="" disabled>
                        Choose a customer
                      </option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.companyName ? ` (${c.companyName})` : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-muted-foreground">Site (Optional)</p>
                  <NativeSelect name="siteId" defaultValue="" className="h-11">
                    <option value="">All Sites</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-muted-foreground">Machine (Optional)</p>
                  <NativeSelect name="excavatorId" defaultValue="" className="h-11">
                    <option value="">All Machines</option>
                    {excavators.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.machineNumber})
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="mb-2 text-sm font-semibold text-muted-foreground">From Date (Optional)</p>
                    <Input type="date" name="from" className="h-11" />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-muted-foreground">To Date (Optional)</p>
                    <Input type="date" name="to" className="h-11" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave a filter blank to include everything unbilled for this customer.
                </p>
                <Button type="submit" size="lg" className="h-12 self-start text-base" disabled={customers.length === 0}>
                  Next
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const [sessions, bankAccounts, business, nextNonGstNumber, customer] = await Promise.all([
    listUnbilledWorkSessions(businessId, customerId, { siteId, excavatorId, from, to }),
    listBankAccounts(businessId),
    getBusinessSettings(businessId),
    previewNextNonGstBillNumber(businessId),
    listCustomerOptions(businessId).then((list) => list.find((c) => c.id === customerId)),
  ]);

  const hasFilters = !!(siteId || excavatorId || from || to);

  return (
    <div>
      <PageHeader title={`Generate Bill — ${customer?.name ?? ""}`} backHref="/bills/new" />
      <div className="px-4 pb-6 md:px-8">
        {hasFilters && (
          <p className="mb-4 text-sm text-muted-foreground">
            Showing filtered jobs —{" "}
            <a href={`/bills/new?customerId=${customerId}`} className="font-medium text-primary underline underline-offset-2">
              clear filters
            </a>
          </p>
        )}
        <GenerateBillForm
          customerId={customerId}
          sessions={sessions.map((s) => ({
            id: s.id,
            excavatorName: s.excavator.name,
            machineNumber: s.excavator.machineNumber,
            siteName: s.site.name,
            startDate: s.startDate.toISOString(),
            endDate: (s.endDate ?? s.startDate).toISOString(),
            totalHours: s.totalHours,
          }))}
          bankAccounts={bankAccounts}
          businessGstNumber={business.gstNumber}
          nextNonGstNumber={nextNonGstNumber}
        />
      </div>
    </div>
  );
}
