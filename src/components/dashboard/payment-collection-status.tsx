import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";

export function PaymentCollectionStatus({
  paidCount,
  partialCount,
  overdueCount,
  totalBilled,
  totalReceived,
  totalPending,
}: {
  paidCount: number;
  partialCount: number;
  overdueCount: number;
  totalBilled: number;
  totalReceived: number;
  totalPending: number;
}) {
  const receivedPct = totalBilled > 0 ? Math.round((totalReceived / totalBilled) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2.5">
        <Card className="border-working/30 bg-working/5 py-0">
          <CardContent className="flex flex-col items-center gap-1 py-4 text-center">
            <CheckCircle2 className="size-5 text-working" />
            <p className="text-2xl font-extrabold tabular-nums">{paidCount}</p>
            <p className="text-xs font-medium text-muted-foreground">Paid</p>
          </CardContent>
        </Card>
        <Card className="border-idle-foreground/30 bg-idle/40 py-0">
          <CardContent className="flex flex-col items-center gap-1 py-4 text-center">
            <Clock className="size-5 text-idle-foreground" />
            <p className="text-2xl font-extrabold tabular-nums">{partialCount}</p>
            <p className="text-xs font-medium text-muted-foreground">Partial</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30 bg-destructive/5 py-0">
          <CardContent className="flex flex-col items-center gap-1 py-4 text-center">
            <AlertCircle className="size-5 text-destructive" />
            <p className="text-2xl font-extrabold tabular-nums">{overdueCount}</p>
            <p className="text-xs font-medium text-muted-foreground">Overdue</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-working" style={{ width: `${receivedPct}%` }} />
          <div className="h-full bg-destructive/70" style={{ width: `${100 - receivedPct}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Received <span className="font-bold text-foreground">{formatCurrency(totalReceived)}</span>
          </span>
          <span>
            Pending <span className="font-bold text-foreground">{formatCurrency(totalPending)}</span>
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
          <span className="font-medium">Total Billed</span>
          <span className="font-bold text-foreground">{formatCurrency(totalBilled)}</span>
        </div>
      </div>
    </div>
  );
}
