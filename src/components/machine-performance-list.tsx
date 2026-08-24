import { ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency } from "@/lib/utils/currency";
import { formatHours } from "@/lib/utils/hours";

type MachinePerformance = {
  id: string;
  name: string;
  machineNumber: string | null;
  status: string;
  hoursThisMonth: number;
  revenueThisMonth: number;
};

export function MachinePerformanceList({ machines }: { machines: MachinePerformance[] }) {
  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <ClipboardList className="size-4" />
          </span>
          Machine Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {machines.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate font-bold">{m.name}</p>
              <p className="text-sm text-muted-foreground">
                {m.machineNumber ?? "—"} · {formatHours(m.hoursThisMonth)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p className="text-lg font-bold">{formatCurrency(m.revenueThisMonth)}</p>
              <StatusBadge status={m.status} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
