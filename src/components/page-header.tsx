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
    <div className="flex animate-fade-in-up items-center justify-between gap-3 px-4 pt-5 pb-4 md:px-8 md:pt-8">
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
        <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-[26px]">{title}</h1>
      </div>
      {action}
    </div>
  );
}
