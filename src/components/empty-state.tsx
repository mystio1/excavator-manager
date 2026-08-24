import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExcavatorLogo } from "@/components/excavator-logo";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex animate-fade-in-up flex-col items-center gap-3 py-14 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {Icon ? <Icon className="size-8" /> : <ExcavatorLogo className="size-8" />}
      </div>
      <div>
        <p className="text-base font-semibold">{title}</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      </div>
      {actionLabel && actionHref && (
        <Button size="lg" className="mt-2 h-11" nativeButton={false} render={<Link href={actionHref} />}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
