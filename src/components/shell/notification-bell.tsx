"use client";

import Link from "next/link";
import { AlertTriangle, Bell, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type Alert = { level: "warning" | "danger"; message: string; href: string };

export function NotificationBell({ alerts }: { alerts: Alert[] }) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label="Alerts"
            className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          />
        }
      >
        <Bell className="size-[18px]" />
        {alerts.length > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
            {alerts.length > 9 ? "9+" : alerts.length}
          </span>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Alerts &amp; Reminders</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
          {alerts.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No alerts right now.</p>
          )}
          {alerts.map((alert, i) => {
            const Icon = alert.level === "danger" ? OctagonAlert : AlertTriangle;
            return (
              <Link
                key={i}
                href={alert.href}
                className={cn(
                  "card-hover flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-semibold",
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
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
