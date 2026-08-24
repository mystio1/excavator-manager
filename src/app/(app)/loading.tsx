import { Loader2 } from "lucide-react";

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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm">Loading…</p>
    </div>
  );
}
