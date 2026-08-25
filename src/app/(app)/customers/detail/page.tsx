"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { CalendarDays, Clock, FileText, Pencil, Truck } from "lucide-react";
import type { getCustomerDetail } from "@/lib/services/customers";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateRange } from "@/lib/utils/dates";
import { formatHours } from "@/lib/utils/hours";
import { StatusBadge } from "@/components/status-badge";
import Loading from "../../loading";

type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomerDetail>>>;

export default function CustomerDetailPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const excavatorId = searchParams.get("excavatorId") ?? "";
  const site = searchParams.get("site") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const query = new URLSearchParams({ id });
  if (excavatorId) query.set("excavatorId", excavatorId);
  if (site) query.set("site", site);
  if (from) query.set("from", from);
  if (to) query.set("to", to);

  const { data } = useSWR<{ detail: CustomerDetail }>(id ? `/api/customers/detail?${query.toString()}` : null, swrFetcher);

  if (!data) return <Loading />;
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
  } = data.detail;

  const hasFilters = !!(excavatorId || site || from || to);

  return (
    <div>
      <PageHeader
        title={customer.name}
        backHref="/customers"
        action={
          <div className="flex gap-2">
            <Button size="lg" className="h-11" nativeButton={false} render={<Link href={`/bills?customerId=${customer.id}`} />}>
              <FileText className="size-4" />
              View &amp; Print Bill
            </Button>
            <Button
              size="lg"
              className="h-11"
              variant="secondary"
              nativeButton={false}
              render={<Link href={`/customers/detail/edit?id=${customer.id}`} />}
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
            <input type="hidden" name="id" value={id} />
            <NativeSelect name="excavatorId" defaultValue={excavatorId} className="h-11">
              <option value="">All Machines</option>
              {machineOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.machineNumber ? ` (${m.machineNumber})` : ""}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="site" defaultValue={site} className="h-11">
              <option value="">All Sites</option>
              {siteOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
            {/* Stacked below sm: — a native date input squeezed to half a
                phone-width row clips its own "dd-mm-yyyy" text, leaving only
                the calendar icon visible. Visible labels too — an empty
                date input shows no placeholder text at all on some mobile
                browsers, so an aria-label alone left the field looking like
                a plain blank box with no hint of what it's for. */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor="from-date" className="text-xs text-muted-foreground">
                  From Date
                </Label>
                <Input id="from-date" type="date" name="from" defaultValue={from} className="h-11" />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor="to-date" className="text-xs text-muted-foreground">
                  To Date
                </Label>
                <Input id="to-date" type="date" name="to" defaultValue={to} className="h-11" />
              </div>
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" size="sm" variant="secondary">
                Apply Filters
              </Button>
              {hasFilters && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-2"
                  nativeButton={false}
                  render={<Link href={`/customers/detail?id=${customer.id}`} />}
                >
                  Clear
                </Button>
              )}
            </div>
          </form>

          {machineHistory.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No work recorded for this customer{hasFilters ? " matching these filters" : " yet"}.
              </CardContent>
            </Card>
          )}
          {machineHistory.map((h) => (
            <Card key={h.id}>
              <CardContent className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{h.excavatorName}</p>
                    {h.machineNumber && <p className="text-sm text-muted-foreground">{h.machineNumber}</p>}
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
