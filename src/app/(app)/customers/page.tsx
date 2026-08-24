"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ArrowRight, Banknote, Plus, Search, UserX, Users } from "lucide-react";
import type { listCustomers } from "@/lib/services/customers";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency } from "@/lib/utils/currency";
import { WhatsAppButton } from "./whatsapp-button";
import { ArchiveCustomerButton } from "./archive-customer-button";
import Loading from "../loading";

type CustomersData = { customers: Awaited<ReturnType<typeof listCustomers>> };

export default function CustomersPage() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? undefined;
  const tripDate = searchParams.get("tripDate") ?? undefined;

  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (tripDate) query.set("tripDate", tripDate);
  const apiPath = `/api/customers${query.toString() ? `?${query.toString()}` : ""}`;

  const { data } = useSWR<CustomersData>(apiPath, swrFetcher, { dedupingInterval: 15_000 });

  if (!data) return <Loading />;
  const { customers } = data;

  const withPendingDues = customers.filter((c) => c.pending > 0.01).length;
  const totalRevenue = Math.round(customers.reduce((sum, c) => sum + c.totalRevenue, 0) * 100) / 100;
  const pendingPayments = Math.round(customers.reduce((sum, c) => sum + c.pending, 0) * 100) / 100;

  return (
    <div>
      <PageHeader
        title="Customers"
        action={
          <Button size="lg" className="h-11" nativeButton={false} render={<Link href="/customers/new" />}>
            <Plus className="size-5" />
            Add Customer
          </Button>
        }
      />

      <div className="flex flex-col gap-4 px-4 pb-6 md:px-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <SummaryCard icon={Users} label="Total Customers" value={customers.length} />
          <SummaryCard icon={UserX} label="With Pending Dues" value={withPendingDues} accent="danger" />
          <SummaryCard icon={Banknote} label="Total Revenue" value={formatCurrency(totalRevenue)} accent="success" />
          <SummaryCard icon={Banknote} label="Pending Payments" value={formatCurrency(pendingPayments)} accent="danger" />
        </div>

        <form method="get" className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Search customers..." className="h-12 pl-10 text-base" />
          </div>
          <Input
            type="date"
            name="tripDate"
            defaultValue={tripDate}
            className="h-12 sm:w-52"
            aria-label="Filter by trip date"
          />
          <Button type="submit" size="lg" variant="secondary" className="h-12">
            Filter
          </Button>
        </form>

        {customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No Customers Yet"
            description="Add your first customer to start tracking work and bills."
            actionLabel="Add Customer"
            actionHref="/customers/new"
          />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-muted-foreground">All Customers ({customers.length})</p>
            {customers.map((customer) => (
              <Link key={customer.id} href={`/customers/detail?id=${customer.id}`}>
                <Card className="card-hover animate-fade-in-up">
                  <CardContent className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold">{customer.name}</p>
                      {customer.companyName && (
                        <p className="truncate text-sm text-muted-foreground">{customer.companyName}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {customer.mobile} · {customer.tripCount} trip{customer.tripCount === 1 ? "" : "s"} ·{" "}
                        {formatCurrency(customer.totalRevenue)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {customer.pending > 0.01 && (
                        <span className="rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-semibold text-destructive">
                          {formatCurrency(customer.pending)} pending
                        </span>
                      )}
                      <WhatsAppButton mobile={customer.mobile} name={customer.name} pending={customer.pending} />
                      <ArchiveCustomerButton id={customer.id} name={customer.name} />
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
