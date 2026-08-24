"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GenerateBillForm } from "./generate-bill-form";
import Loading from "../../loading";

type CustomerOption = { id: string; name: string; companyName: string | null };
type SiteOption = { id: string; name: string };
type ExcavatorOption = { id: string; name: string; machineNumber: string | null };
type Session = {
  id: string;
  excavatorName: string;
  machineNumber: string | null;
  siteName: string;
  startDate: string;
  endDate: string;
  totalHours: number;
};
type BankAccount = { id: string; label: string; isDefaultForGst: boolean; isDefaultForNonGst: boolean };

type BaseData = { customers: CustomerOption[]; sites: SiteOption[]; excavators: ExcavatorOption[] };
type FullData = BaseData & {
  sessions: Session[];
  bankAccounts: BankAccount[];
  businessGstNumber: string | null;
  nextNonGstNumber: string;
  customerName: string;
};

export default function NewBillPage() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customerId") ?? "";
  const siteId = searchParams.get("siteId") ?? "";
  const excavatorId = searchParams.get("excavatorId") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const query = new URLSearchParams();
  if (customerId) query.set("customerId", customerId);
  if (siteId) query.set("siteId", siteId);
  if (excavatorId) query.set("excavatorId", excavatorId);
  if (from) query.set("from", from);
  if (to) query.set("to", to);

  const { data } = useSWR<FullData | BaseData>(`/api/bills/new?${query.toString()}`, swrFetcher);

  if (!data) return <Loading />;
  const { customers, sites, excavators } = data;

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

  const full = data as FullData;
  const hasFilters = !!(siteId || excavatorId || from || to);

  return (
    <div>
      <PageHeader title={`Generate Bill — ${full.customerName}`} backHref="/bills/new" />
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
          sessions={full.sessions}
          bankAccounts={full.bankAccounts}
          businessGstNumber={full.businessGstNumber}
          nextNonGstNumber={full.nextNonGstNumber}
        />
      </div>
    </div>
  );
}
