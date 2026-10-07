"use client";

import Link from "next/link";
import { preload } from "swr";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { swrFetcher } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { fromPaise, toPaise } from "@/components/bill/money-preview";

/** Starts the detail fetch as soon as a tap/click begins, not after the page
 * navigation finishes — by the time BillDetailPage mounts and calls
 * useSWR("/api/bills/{id}", ...) with the same key, SWR reuses this
 * in-flight/cached request instead of firing a second one, cutting the
 * round-trip the user otherwise waits through after tapping a bill. */
function prefetchBill(id: string) {
  preload(`/api/bills/${id}`, swrFetcher);
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  PAID: { label: "Paid", className: "bg-emerald-700 text-white" },
  PARTIAL: { label: "Partially Paid", className: "bg-idle text-idle-foreground" },
  UNPAID: { label: "Unpaid", className: "bg-destructive/10 text-red-700 dark:text-red-400" },
};

type BillListItem = {
  id: string;
  billNumber: string;
  isDirect: boolean;
  billDate: Date;
  totalAmount: number;
  paidAmount: number;
  status: string;
  customer: { name: string; companyName: string | null };
  excavator: { name: string; machineNumber: string | null } | null;
  items: { siteName: string; excavator: { name: string; machineNumber: string | null } }[];
};

/** The list itself does not filter: search and the All / By App / Self Made
 * tabs are sent to the server (so they cover EVERY bill, not just the pages the
 * browser has loaded). `query` is only the text in the box. */
export function BillsList({
  bills,
  query,
  onQueryChange,
  searching = false,
}: {
  bills: BillListItem[];
  query: string;
  onQueryChange: (value: string) => void;
  /** A search for the current text is still loading. */
  searching?: boolean;
}) {
  const filtered = bills;

  return (
    <>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search bills by customer, bill number, site, machine or amount"
          placeholder="Search bills…"
          className="h-11 pl-9"
        />
      </div>

      {filtered.length === 0 && (
        <p role="status" className="py-6 text-center text-sm text-muted-foreground">
          {searching ? "Searching…" : query.trim() ? "No bills match your search." : "No bills in this view."}
        </p>
      )}

      {filtered.map((bill) => {
        const status = STATUS_LABEL[bill.status] ?? STATUS_LABEL.UNPAID;
        // Whole paise, so 0.3 - 0.1 style float dust can never show as "pending".
        const pending = fromPaise(toPaise(bill.totalAmount) - toPaise(bill.paidAmount));
        return (
          <Link
            key={bill.id}
            href={`/bills/detail?id=${bill.id}`}
            onPointerDown={() => prefetchBill(bill.id)}
            onMouseEnter={() => prefetchBill(bill.id)}
            className="block rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="card-hover animate-fade-in-up">
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="min-w-0 break-words text-lg font-bold">{bill.billNumber}</p>
                      {bill.isDirect && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-semibold">
                          Self
                        </Badge>
                      )}
                    </div>
                    <p className="break-words text-sm text-muted-foreground">
                      {bill.customer.name}
                      {bill.customer.companyName ? ` — ${bill.customer.companyName}` : ""}
                    </p>
                  </div>
                  <Badge className={cn("h-6 shrink-0 px-2.5 text-sm font-semibold", status.className)}>{status.label}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{formatDate(bill.billDate)}</span>
                  <span className="font-semibold">{formatCurrency(bill.totalAmount)}</span>
                </div>
                {pending > 0.01 && (
                  <p className="text-right text-sm font-medium text-red-700 dark:text-red-400">
                    {formatCurrency(pending)} pending
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </>
  );
}
