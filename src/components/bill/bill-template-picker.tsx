"use client";

import useSWR, { useSWRConfig } from "swr";
import { LayoutTemplate } from "lucide-react";
import { apiFetch, swrFetcher } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { cn } from "@/lib/utils";
import { BILL_TEMPLATES, type BillTemplate } from "./summary-rows";

const SHORT: Record<BillTemplate, string> = { STANDARD: "Standard", DAILY_SUMMARY: "Daily Summary" };
const HINT: Record<BillTemplate, string> = {
  STANDARD: "One line per machine / period.",
  DAILY_SUMMARY: "One row per day: readings, hours × rate, Bucket / Breaker, diesel.",
};

/** The bill layout, chosen here in the Bills tab: applies to viewing, printing, PDF and sharing. */
export function BillTemplatePicker({ className }: { className?: string }) {
  const { mutate } = useSWRConfig();
  const { data } = useSWR<{ billTemplate: BillTemplate }>("/api/settings/bill-template", swrFetcher);
  const current = data?.billTemplate ?? "STANDARD";
  const { error, pending, run } = useApiForm(async (billTemplate: BillTemplate) => {
    await apiFetch("/api/settings/bill-template", { method: "PATCH", body: JSON.stringify({ billTemplate }) });
    await mutate((k) => typeof k === "string" && (k === "/api/settings/bill-template" || /^\/api\/bills\/[^/?]+$/.test(k)));
  });

  return (
    <div className={cn("print-hidden flex flex-col gap-2 rounded-xl border bg-card p-3", className)}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <LayoutTemplate className="size-4 text-primary-text" />
        Bill Template
      </div>
      <div role="radiogroup" aria-label="Bill template" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {BILL_TEMPLATES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={current === t}
            disabled={pending || !data}
            onClick={() => current !== t && void run(t)}
            className={cn(
              "min-h-10 rounded-md px-2 text-sm font-semibold transition-colors",
              current === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {SHORT[t]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{HINT[current]} Used when viewing, printing and sharing bills.</p>
      {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
