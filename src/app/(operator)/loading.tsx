import { Loader2 } from "lucide-react";

/** Same reasoning as (app)/loading.tsx — gives instant feedback on
 * navigation inside the operator portal instead of total silence. */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm">Loading…</p>
    </div>
  );
}
