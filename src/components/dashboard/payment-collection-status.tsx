"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyCompact } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { PaymentCollectionCustomer } from "@/lib/services/dashboard";

type Bucket = "paid" | "partial" | "overdue";

const BUCKETS: Record<
  Bucket,
  { icon: typeof CheckCircle2; label: string; border: string; bg: string; text: string; ring: string; amountLabel: string }
> = {
  paid: {
    icon: CheckCircle2,
    label: "Paid",
    border: "border-working/30",
    bg: "bg-working/5",
    text: "text-working",
    ring: "ring-working",
    amountLabel: "Billed",
  },
  partial: {
    icon: Clock,
    label: "Partial",
    border: "border-idle-foreground/30",
    bg: "bg-idle/40",
    text: "text-idle-foreground",
    ring: "ring-idle-foreground",
    amountLabel: "Pending",
  },
  overdue: {
    icon: AlertCircle,
    label: "Overdue",
    border: "border-destructive/30",
    bg: "bg-destructive/5",
    text: "text-destructive",
    ring: "ring-destructive",
    amountLabel: "Pending",
  },
};

export function PaymentCollectionStatus({
  paidCount,
  partialCount,
  overdueCount,
  totalBilled,
  totalReceived,
  totalPending,
  paidCustomers,
  partialCustomers,
  overdueCustomers,
}: {
  paidCount: number;
  partialCount: number;
  overdueCount: number;
  totalBilled: number;
  totalReceived: number;
  totalPending: number;
  paidCustomers: PaymentCollectionCustomer[];
  partialCustomers: PaymentCollectionCustomer[];
  overdueCustomers: PaymentCollectionCustomer[];
}) {
  const [open, setOpen] = useState<Bucket | null>(null);
  const receivedPct = totalBilled > 0 ? Math.round((totalReceived / totalBilled) * 100) : 0;

  const counts: Record<Bucket, number> = { paid: paidCount, partial: partialCount, overdue: overdueCount };
  const customers: Record<Bucket, PaymentCollectionCustomer[]> = {
    paid: paidCustomers,
    partial: partialCustomers,
    overdue: overdueCustomers,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2.5">
        {(Object.keys(BUCKETS) as Bucket[]).map((bucket) => {
          const { icon: Icon, label, border, bg, text, ring } = BUCKETS[bucket];
          const isOpen = open === bucket;
          return (
            <Card
              key={bucket}
              role="button"
              tabIndex={0}
              onClick={() => setOpen(isOpen ? null : bucket)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(isOpen ? null : bucket);
                }
              }}
              className={cn(
                border,
                bg,
                "cursor-pointer py-0 transition-shadow",
                isOpen && "ring-2 ring-offset-2 ring-offset-background",
                isOpen && ring,
              )}
            >
              <CardContent className="flex flex-col items-center gap-1 py-4 text-center">
                <Icon className={cn("size-5", text)} />
                <p className="text-2xl font-extrabold tabular-nums">{counts[bucket]}</p>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {open && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-2.5 animate-fade-in-up">
          {customers[open].length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">No customers in this group.</p>
          ) : (
            customers[open].map((c) => (
              <Link
                key={c.id}
                href={`/customers/detail?id=${c.id}`}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-card"
              >
                <span className="truncate font-medium">{c.name}</span>
                <span className={cn("shrink-0 font-bold tabular-nums", BUCKETS[open].text)}>
                  {formatCurrencyCompact(open === "paid" ? c.billed : c.pending)}
                </span>
              </Link>
            ))
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-working" style={{ width: `${receivedPct}%` }} />
          <div className="h-full bg-destructive/70" style={{ width: `${100 - receivedPct}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Received <span className="font-bold text-foreground">{formatCurrencyCompact(totalReceived)}</span>
          </span>
          <span>
            Pending <span className="font-bold text-foreground">{formatCurrencyCompact(totalPending)}</span>
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
          <span className="font-medium">Total Billed</span>
          <span className="font-bold text-foreground">{formatCurrencyCompact(totalBilled)}</span>
        </div>
      </div>
    </div>
  );
}
