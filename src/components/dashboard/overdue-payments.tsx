import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrencyCompact } from "@/lib/utils/currency";

type OverdueRow = {
  billId: string;
  billNumber: string;
  customerId: string;
  customerName: string;
  pending: number;
  daysOverdue: number;
};

export function OverduePayments({ bills }: { bills: OverdueRow[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {bills.map((b) => (
        <div
          key={b.billId}
          className="flex items-center justify-between gap-3 rounded-xl border-l-4 border-l-destructive bg-destructive/5 p-3"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{b.customerName}</p>
              <p className="text-xs text-muted-foreground">
                Overdue by {b.daysOverdue} day{b.daysOverdue === 1 ? "" : "s"} · Bill {b.billNumber}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <p className="text-right font-bold text-destructive">{formatCurrencyCompact(b.pending)}</p>
            <Button
              size="sm"
              variant="secondary"
              nativeButton={false}
              render={<Link href={`/bills/detail?id=${b.billId}`} />}
            >
              View
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
