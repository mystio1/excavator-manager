import { ExcavatorLogo } from "@/components/excavator-logo";

/**
 * Shown instantly the moment any navigation starts under (app)/ — the
 * sidebar/header stay mounted and interactive, only this content area
 * swaps in while the new page's data loads. Without this, a real (if
 * brief) network round-trip renders as total silence: no URL change, no
 * visual change, nothing — which reads as "the click didn't register" and
 * invites exactly the repeated-clicking this exists to prevent.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <ExcavatorLogo animated className="size-9" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">Loading…</p>
    </div>
  );
}
