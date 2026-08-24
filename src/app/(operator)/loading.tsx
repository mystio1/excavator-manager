import { ExcavatorLogo } from "@/components/excavator-logo";

/** Same reasoning as (app)/loading.tsx — gives instant feedback on
 * navigation inside the operator portal instead of total silence. */
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
