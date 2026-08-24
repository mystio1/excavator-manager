import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ExactValueBadge } from "@/components/dashboard/exact-value-badge";
import { cn } from "@/lib/utils";

export function SummaryCard({
  icon: Icon,
  label,
  value,
  exactValue,
  accent,
  trendPct,
  action,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  /** Full, uncompacted value (e.g. "₹1,52,896") shown in a hover/click
   * tooltip when `value` has been abbreviated (e.g. "₹1.5L"). */
  exactValue?: string;
  accent?: "default" | "success" | "warning" | "danger" | "info" | "premium";
  /** Positive = up (green), negative = down (red). Omit when there's
   * nothing real to compare against — never show a fabricated trend. */
  trendPct?: number | null;
  /** Small trigger (e.g. a "View Detail" button) rendered under the label. */
  action?: ReactNode;
}) {
  const accentClass = {
    default: "bg-gradient-to-br from-[#f4a910] to-[#cf900e] text-white shadow-[0_6px_16px_-4px_rgba(244,169,16,0.55)]",
    success: "bg-gradient-to-br from-[#10b981] to-[#059669] text-white shadow-[0_6px_16px_-4px_rgba(16,185,129,0.5)]",
    warning: "bg-gradient-to-br from-[#f59e0b] to-[#d97706] text-white shadow-[0_6px_16px_-4px_rgba(245,158,11,0.5)]",
    danger: "bg-gradient-to-br from-[#ef4444] to-[#dc2626] text-white shadow-[0_6px_16px_-4px_rgba(239,68,68,0.5)]",
    info: "bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-white shadow-[0_6px_16px_-4px_rgba(59,130,246,0.5)]",
    premium: "bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] text-white shadow-[0_6px_16px_-4px_rgba(139,92,246,0.5)]",
  }[accent ?? "default"];

  const topBorderClass = {
    default: "border-t-primary",
    success: "border-t-working",
    warning: "border-t-idle-foreground",
    danger: "border-t-destructive",
    info: "border-t-info",
    premium: "border-t-purple",
  }[accent ?? "default"];

  const washClass = {
    default: "bg-gradient-to-b from-[#f4a910]/[0.08] to-transparent",
    success: "bg-gradient-to-b from-[#10b981]/[0.08] to-transparent",
    warning: "bg-gradient-to-b from-[#f59e0b]/[0.08] to-transparent",
    danger: "bg-gradient-to-b from-[#ef4444]/[0.08] to-transparent",
    info: "bg-gradient-to-b from-[#3b82f6]/[0.08] to-transparent",
    premium: "bg-gradient-to-b from-[#8b5cf6]/[0.08] to-transparent",
  }[accent ?? "default"];

  return (
    <Card className={cn("card-hover animate-fade-in-up gap-2.5 border-t-4 py-4", topBorderClass, washClass)}>
      <CardContent className="flex items-start gap-3 px-4">
        <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", accentClass)}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1">
              <p className="min-w-0 truncate text-xs font-semibold text-muted-foreground">{label}</p>
              {exactValue && <ExactValueBadge exactValue={exactValue} />}
            </span>
            {action}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-2xl leading-tight font-extrabold tracking-tight tabular-nums sm:text-[28px]">{value}</p>
            {trendPct != null && (
              <span
                className={cn(
                  "flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold",
                  trendPct >= 0 ? "bg-working/12 text-working" : "bg-destructive/12 text-destructive",
                )}
              >
                {trendPct >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                {Math.abs(trendPct)}%
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
