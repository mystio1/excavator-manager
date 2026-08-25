import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  title,
  action,
  backHref,
}: {
  title: string;
  action?: React.ReactNode;
  /** Renders a circular back button before the title, linking here. */
  backHref?: string;
}) {
  return (
    <div className="flex animate-fade-in-up flex-col gap-3 px-4 pt-5 pb-4 sm:flex-row sm:items-center sm:justify-between md:px-8 md:pt-8">
      <div className="flex min-w-0 items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            <ArrowLeft className="size-5" />
          </Link>
        )}
        {/* Stacked below sm: so the title always gets the full row width —
            on a phone, action buttons wide enough to matter (e.g. two
            labeled buttons) used to share this row with the title and
            could squeeze it down to a couple of characters + ellipsis. */}
        <h1 className="min-w-0 flex-1 text-2xl font-extrabold tracking-tight sm:truncate sm:text-[26px]">{title}</h1>
      </div>
      {action}
    </div>
  );
}
