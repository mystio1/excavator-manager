import Link from "next/link";
import { AlertTriangle, ChevronRight, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Alert = { level: "warning" | "danger"; message: string; href: string };

export function AlertBanner({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-muted-foreground">Alerts &amp; Reminders</p>
      {alerts.map((alert, i) => {
        const Icon = alert.level === "danger" ? OctagonAlert : AlertTriangle;
        return (
          <Link
            key={i}
            href={alert.href}
            className={cn(
              "card-hover flex animate-fade-in-up items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-semibold",
              alert.level === "danger"
                ? "border-destructive/25 bg-destructive/8 text-destructive"
                : "border-idle-foreground/15 bg-idle/60 text-idle-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full",
                alert.level === "danger" ? "bg-destructive/15" : "bg-idle-foreground/15",
              )}
            >
              <Icon className="size-4 shrink-0" />
            </span>
            <span className="flex-1">{alert.message}</span>
            <ChevronRight className="size-4 shrink-0 opacity-60" />
          </Link>
        );
      })}
    </div>
  );
}
