import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatHours } from "@/lib/utils/hours";

type OperatorRow = {
  id: string;
  name: string;
  machineName: string | null;
  machineNumber: string | null;
  workDays: number;
  totalHours: number;
  avgHoursPerDay: number;
  pendingReadings: number;
  rejectedReadings: number;
};

function performanceStatus(op: OperatorRow) {
  if (op.rejectedReadings > 0 || op.pendingReadings > 2) {
    return { label: "Action Required", className: "bg-destructive/10 text-destructive" };
  }
  if (op.pendingReadings > 0) {
    return { label: "Needs Attention", className: "bg-idle text-idle-foreground" };
  }
  if (op.workDays >= 15) {
    return { label: "Excellent", className: "bg-working/15 text-working" };
  }
  if (op.workDays > 0) {
    return { label: "Good", className: "bg-info/15 text-info" };
  }
  return { label: "No Activity", className: "bg-muted text-muted-foreground" };
}

export function OperatorPerformance({ operators }: { operators: OperatorRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      {operators.map((op) => {
        const status = performanceStatus(op);
        const initials = op.name
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();
        return (
          <Link key={op.id} href={`/operators/${op.id}`}>
            <Card className="card-hover">
              <CardContent className="flex items-center gap-3 py-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold">{op.name}</p>
                    <Badge className={status.className}>{status.label}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {op.machineName
                      ? op.machineNumber
                        ? `${op.machineName} (${op.machineNumber})`
                        : op.machineName
                      : "Not assigned"}{" "}
                    · {op.workDays} days ·{" "}
                    {formatHours(op.totalHours)} · {formatHours(op.avgHoursPerDay)}/day
                  </p>
                  {(op.pendingReadings > 0 || op.rejectedReadings > 0) && (
                    <p className="mt-0.5 text-xs text-destructive">
                      {op.pendingReadings > 0 && `${op.pendingReadings} pending`}
                      {op.pendingReadings > 0 && op.rejectedReadings > 0 && " · "}
                      {op.rejectedReadings > 0 && `${op.rejectedReadings} rejected`}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
