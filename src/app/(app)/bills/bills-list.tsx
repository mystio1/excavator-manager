"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  PAID: { label: "Paid", className: "bg-working text-working-foreground" },
  PARTIAL: { label: "Partially Paid", className: "bg-idle text-idle-foreground" },
  UNPAID: { label: "Unpaid", className: "bg-destructive/10 text-destructive" },
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

export function BillsList({ bills }: { bills: BillListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bills;
    return bills.filter((bill) => {
      const haystack = [
        bill.billNumber,
        bill.customer.name,
        bill.customer.companyName,
        bill.excavator?.name,
        bill.excavator?.machineNumber,
        String(bill.totalAmount),
        ...bill.items.flatMap((item) => [item.siteName, item.excavator.name, item.excavator.machineNumber]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [bills, query]);

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by customer, bill number, site, machine or amount..."
          className="h-11 pl-9"
        />
      </div>

      {filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">No bills match your search.</p>
      )}

      {filtered.map((bill) => {
        const status = STATUS_LABEL[bill.status] ?? STATUS_LABEL.UNPAID;
        const pending = bill.totalAmount - bill.paidAmount;
        return (
          <Link key={bill.id} href={`/bills/detail?id=${bill.id}`}>
            <Card className="card-hover animate-fade-in-up">
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-lg font-bold">{bill.billNumber}</p>
                      {bill.isDirect && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-semibold">
                          Self
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {bill.customer.name}
                      {bill.customer.companyName ? ` — ${bill.customer.companyName}` : ""}
                    </p>
                  </div>
                  <Badge className={cn("h-6 px-2.5 text-sm font-semibold", status.className)}>{status.label}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{formatDate(bill.billDate)}</span>
                  <span className="font-semibold">{formatCurrency(bill.totalAmount)}</span>
                </div>
                {pending > 0.01 && (
                  <p className="text-right text-sm font-medium text-destructive">
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
