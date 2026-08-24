import { Banknote, PlayCircle, Receipt, StopCircle } from "lucide-react";
import type { ActivityEvent } from "@/lib/services/dashboard";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

const ICONS = {
  "work-started": PlayCircle,
  "work-stopped": StopCircle,
  bill: Receipt,
  payment: Banknote,
} as const;

const ICON_CLASS = {
  "work-started": "bg-working/15 text-working",
  "work-stopped": "bg-muted text-muted-foreground",
  bill: "bg-primary/10 text-primary",
  payment: "bg-working/15 text-working",
} as const;

export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="flex flex-col">
      {events.map((event, i) => {
        const Icon = ICONS[event.kind];
        return (
          <div key={event.id} className="relative flex animate-fade-in-up gap-3 pb-5 last:pb-0">
            {i < events.length - 1 && (
              <span className="absolute top-9 left-[17px] h-[calc(100%-16px)] w-px bg-border" aria-hidden />
            )}
            <div className={cn("z-10 flex size-9 shrink-0 items-center justify-center rounded-full ring-4 ring-card", ICON_CLASS[event.kind])}>
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1 pt-1.5">
              <p className="text-sm font-semibold">{event.message}</p>
              <p className="text-xs font-medium text-muted-foreground">
                {event.detail} · {formatDate(event.at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
