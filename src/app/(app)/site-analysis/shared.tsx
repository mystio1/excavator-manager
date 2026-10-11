"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { addDays, format, startOfMonth, startOfWeek, subMonths, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

/** "2026-09-15" -> "15 Sep 2026" (parsed as a local date so no timezone shift). */
export function fmtDay(day: string) {
  return formatDate(new Date(`${day}T00:00:00`));
}

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

export type RangeChip = "all" | "today" | "week" | "month" | "lastMonth";

export const CHIPS: { id: RangeChip; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "lastMonth", label: "Last Month" },
];

export function rangeForChip(chip: RangeChip, now = new Date()): { from: string; to: string } {
  switch (chip) {
    case "today":
      return { from: ymd(now), to: ymd(now) };
    case "week": {
      const start = startOfWeek(now, { weekStartsOn: 1 });
      return { from: ymd(start), to: ymd(addDays(start, 6)) };
    }
    case "month":
      return { from: ymd(startOfMonth(now)), to: ymd(endOfMonth(now)) };
    case "lastMonth": {
      const last = subMonths(now, 1);
      return { from: ymd(startOfMonth(last)), to: ymd(endOfMonth(last)) };
    }
    default:
      return { from: "", to: "" };
  }
}

function activeChip(from: string, to: string): RangeChip | "custom" {
  if (!from && !to) return "all";
  for (const chip of CHIPS) {
    if (chip.id === "all") continue;
    const r = rangeForChip(chip.id);
    if (r.from === from && r.to === to) return chip.id;
  }
  return "custom";
}

/** Quick chips (Today / This Week / This Month / Last Month) plus a custom From / To range. */
export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const active = activeChip(from, to);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
        {CHIPS.map((chip) => (
          <Button
            key={chip.id}
            type="button"
            size="sm"
            variant={active === chip.id ? "default" : "outline"}
            aria-pressed={active === chip.id}
            className="h-9 px-3"
            onClick={() => onChange(rangeForChip(chip.id))}
          >
            {chip.label}
          </Button>
        ))}
        <Button type="button" size="sm" variant={active === "custom" ? "default" : "outline"} aria-pressed={active === "custom"} className="h-9 px-3" onClick={() => document.getElementById("range-from")?.focus()}>
          Custom
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <div className="flex flex-col gap-1">
          <Label htmlFor="range-from" className="text-xs text-muted-foreground">
            From Date
          </Label>
          <Input id="range-from" type="date" value={from} max={to || undefined} onChange={(e) => onChange({ from: e.target.value, to })} className="h-11" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="range-to" className="text-xs text-muted-foreground">
            To Date
          </Label>
          <Input id="range-to" type="date" value={to} min={from || undefined} onChange={(e) => onChange({ from, to: e.target.value })} className="h-11" />
        </div>
      </div>
    </div>
  );
}

export function Pager({
  page,
  totalPages,
  total,
  onPage,
  noun,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
  noun: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pt-2 text-sm">
      <span className="text-muted-foreground">
        {total} {noun}
        {total === 1 ? "" : "s"} · Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="h-9" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-9" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export type Crumb = { label: string; href?: string };

/** Dashboard > Site Analysis > Site > Machine ... — every level links back. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="print-hidden px-4 pt-4 md:px-8 md:pt-6">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5" aria-hidden="true" />}
            {c.href ? (
              <Link href={c.href} className="font-medium text-primary-text hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-semibold text-foreground">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function KeyValue({ label, value, strong, className }: { label: string; value: React.ReactNode; strong?: boolean; className?: string }) {
  return (
    <>
      <span className={cn("text-muted-foreground", className)}>{label}</span>
      <span className={cn("text-right tabular-nums", strong ? "font-bold" : "font-semibold")}>{value}</span>
    </>
  );
}

export const SITE_TYPE_LABEL: Record<string, string> = { CUSTOMER_SITE: "Customer Site", SELF_SITE: "Self Site" };
export const SITE_STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", COMPLETED: "Completed", ON_HOLD: "On Hold" };

export function SiteStatusBadge({ status }: { status: string }) {
  const tone =
    status === "ACTIVE"
      ? "bg-working/15 text-working"
      : status === "ON_HOLD"
        ? "bg-idle/30 text-idle-foreground"
        : "bg-muted text-muted-foreground";
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", tone)}>{SITE_STATUS_LABEL[status] ?? status}</span>;
}

/** Query string from only the non-empty entries. */
export function qs(params: Record<string, string | number | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}
