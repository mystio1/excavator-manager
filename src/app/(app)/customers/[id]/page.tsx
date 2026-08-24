import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/session";
import { getCustomerDetail } from "@/lib/services/customers";
import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateRange } from "@/lib/utils/dates";
import { formatHours } from "@/lib/utils/hours";
import { StatusBadge } from "@/components/status-badge";
import { CalendarDays, Clock, FileText, Pencil, Truck } from "lucide-react";

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ excavatorId?: string; site?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { businessId } = await requireBusiness();

  const detail = await getCustomerDetail(businessId, id, {
    excavatorId: sp.excavatorId,
    siteName: sp.site,
    from: sp.from,
    to: sp.to,
  });
  if (!detail) notFound();

  const {
    customer,
    totalMachinesUsed,
    totalWorkingDays,
    totalHours,
    totalRevenue,
    pending,
    machineOptions,
    siteOptions,
    machineHistory,
  } = detail;

  return (
    <div>
      <PageHeader
        title={customer.name}
        backHref="/customers"
        action={
          <div className="flex gap-2">
            <Button
              size="lg"
              className="h-11"
              nativeButton={false}
              render={<Link href={`/bills?customerId=${customer.id}`} />}
            >
              <FileText className="size-4" />
              View &amp; Print Bill
            </Button>
            <Button
              size="lg"
              className="h-11"
              variant="secondary"
              nativeButton={false}
              render={<Link href={`/customers/${customer.id}/edit`} />}
            >
              <Pencil className="size-4" />
              Edit
            </Button>
          </div>
        }
      />
      <div className="flex flex-col gap-4 px-4 pb-6 md:px-8">
        <Card>
          <CardContent className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1 text-sm">
              {customer.companyName && <p className="font-semibold">{customer.companyName}</p>}
              <p className="text-muted-foreground">{customer.mobile}</p>
              {customer.address && <p className="text-muted-foreground">{customer.address}</p>}
              {customer.gstNumber && <p className="text-muted-foreground">GST: {customer.gstNumber}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-working/15 px-3 py-1 text-sm font-semibold text-working">
                {formatCurrency(totalRevenue)} Total
              </span>
              {pending > 0.01 && (
                <span className="rounded-full bg-destructive/15 px-3 py-1 text-sm font-semibold text-destructive">
                  {formatCurrency(pending)} Pending
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard icon={Truck} label="Machines Used" value={totalMachinesUsed} />
          <SummaryCard icon={CalendarDays} label="Working Days" value={totalWorkingDays} />
          <SummaryCard icon={Clock} label="Total Hours" value={formatHours(totalHours)} />
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-muted-foreground">Machine History</p>

          <form method="get" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <NativeSelect name="excavatorId" defaultValue={sp.excavatorId ?? ""} className="h-11">
              <option value="">All Machines</option>
              {machineOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.machineNumber ? ` (${m.machineNumber})` : ""}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="site" defaultValue={sp.site ?? ""} className="h-11">
              <option value="">All Sites</option>
              {siteOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
            <div className="flex gap-2">
              <Input type="date" name="from" defaultValue={sp.from} className="h-11" aria-label="From date" />
              <Input type="date" name="to" defaultValue={sp.to} className="h-11" aria-label="To date" />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" size="sm" variant="secondary">
                Apply Filters
              </Button>
              {(sp.excavatorId || sp.site || sp.from || sp.to) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-2"
                  nativeButton={false}
                  render={<Link href={`/customers/${customer.id}`} />}
                >
                  Clear
                </Button>
              )}
            </div>
          </form>

          {machineHistory.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No work recorded for this customer{sp.excavatorId || sp.site || sp.from || sp.to ? " matching these filters" : " yet"}.
              </CardContent>
            </Card>
          )}
          {machineHistory.map((h) => (
            <Card key={h.id}>
              <CardContent className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{h.excavatorName}</p>
                    {h.machineNumber && (
                      <p className="text-sm text-muted-foreground">{h.machineNumber}</p>
                    )}
                  </div>
                  {h.status === "ACTIVE" && <StatusBadge status="WORKING" />}
                </div>
                <p className="text-sm text-muted-foreground">{h.siteName}</p>
                <p className="text-sm">{formatDateRange(h.startDate, h.endDate)}</p>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Operator: {h.operatorName}</span>
                  <span className="font-semibold">{formatHours(h.totalHours)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
