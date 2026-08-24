import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  WORKING: { label: "Working", dot: "🟢", className: "bg-working text-working-foreground" },
  IDLE: { label: "Idle", dot: "🟡", className: "bg-idle text-idle-foreground" },
  SERVICE: { label: "Under Service", dot: "🟠", className: "bg-service text-service-foreground" },
} as const;

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.IDLE;
  return (
    <Badge className={cn(config.className, "h-6 px-2.5 text-sm font-semibold", className)}>
      <span aria-hidden>{config.dot}</span>
      {config.label}
    </Badge>
  );
}
