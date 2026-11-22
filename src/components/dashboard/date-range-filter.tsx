"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** An inclusive day range as yyyy-MM-dd strings (the viewer's local calendar days). */
export type DayRange = { from: string; to: string };

// Date arithmetic on yyyy-MM-dd strings, done in UTC so no timezone can shift a day.
const toDate = (d: string) => new Date(`${d}T00:00:00.000Z`);
const toDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toDay(x);
};
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const monthEnd = (d: string) => {
  const x = toDate(monthStart(d));
  x.setUTCMonth(x.getUTCMonth() + 1, 0);
  return toDay(x);
};

/** Indian financial year: 1 April to 31 March. */
const fyStartYear = (today: string) => {
  const y = Number(today.slice(0, 4));
  return Number(today.slice(5, 7)) >= 4 ? y : y - 1;
};
const fyRange = (startYear: number): DayRange => ({ from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` });

export function thisMonth(today: string): DayRange {
  return { from: monthStart(today), to: monthEnd(today) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (d: string, withYear: boolean) =>
  `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}${withYear ? ` ${d.slice(2, 4)}` : ""}`;

/** "1 Nov – 30 Nov", with the year when it is not this year or the range spans years. */
export function formatDayRange(r: DayRange, today: string) {
  const withYear = r.from.slice(0, 4) !== r.to.slice(0, 4) || r.from.slice(0, 4) !== today.slice(0, 4);
  return r.from === r.to ? short(r.from, withYear) : `${short(r.from, withYear)} – ${short(r.to, withYear)}`;
}

/**
 * The dashboard's date filter: quick presets, financial years and a custom From/To, in a popover
 * under a button that shows the current range (the same pattern as the transport app).
 */
export function DateRangeFilter({
  value,
  today,
  onChange,
}: {
  value: DayRange;
  /** The viewer's local yyyy-MM-dd. */
  today: string;
  onChange: (range: DayRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayRange>(value);
  const [error, setError] = useState<string | null>(null);

  const lastMonthEnd = addDays(monthStart(today), -1);
  const presets: { label: string; range: DayRange }[] = [
    { label: "Today", range: { from: today, to: today } },
    { label: "7D", range: { from: addDays(today, -6), to: today } },
    { label: "30D", range: { from: addDays(today, -29), to: today } },
    { label: "90D", range: { from: addDays(today, -89), to: today } },
    { label: "This Month", range: thisMonth(today) },
    { label: "Last Month", range: { from: monthStart(lastMonthEnd), to: lastMonthEnd } },
  ];
  const currentFy = fyStartYear(today);
  const financialYears = Array.from({ length: 5 }, (_, i) => currentFy - i);

  const pick = (range: DayRange) => {
    onChange(range);
    setDraft(range);
    setError(null);
    setOpen(false);
  };
  const isActive = (r: DayRange) => r.from === value.from && r.to === value.to;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(value);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <Popover.Trigger
        render={
          <Button
            variant="outline"
            size="lg"
            className="h-11 gap-2 self-start font-semibold whitespace-nowrap"
            aria-label={`Date range: ${formatDayRange(value, today)}. Change`}
          />
        }
      >
        <CalendarDays className="size-4" />
        {formatDayRange(value, today)}
        <ChevronDown className="size-4 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="isolate z-50 outline-none" side="bottom" align="end" sideOffset={6} collisionPadding={16}>
          <Popover.Popup className="max-h-(--available-height) w-80 max-w-[calc(100vw-2rem)] overflow-y-auto origin-(--transform-origin) rounded-xl bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0">
            <p className="mb-2 text-xs font-bold text-muted-foreground">Quick range</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {presets.map((p) => (
                <Chip key={p.label} active={isActive(p.range)} tone="primary" onClick={() => pick(p.range)}>
                  {p.label}
                </Chip>
              ))}
            </div>

            <p className="mb-2 text-xs font-bold text-muted-foreground">Financial Year (1 Apr – 31 Mar)</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {financialYears.map((y) => (
                <Chip key={y} active={isActive(fyRange(y))} tone="purple" onClick={() => pick(fyRange(y))}>
                  FY {y}-{String(y + 1).slice(-2)}
                </Chip>
              ))}
            </div>

            <p className="mb-2 text-xs font-bold text-muted-foreground">Custom</p>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.from || !draft.to) return setError("Pick both dates");
                if (draft.from > draft.to) return setError("'From' must be on or before 'To'");
                pick(draft);
              }}
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor="dash-from" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="dash-from"
                  type="date"
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="dash-to" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="dash-to"
                  type="date"
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                  className="h-11"
                />
              </div>
              {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
              <Button type="submit" size="lg" className="h-11 font-bold">
                Apply
              </Button>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Chip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "primary" | "purple";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full px-3 text-sm font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        tone === "primary"
          ? active
            ? "bg-primary text-primary-foreground"
            : "bg-primary/10 text-primary-text hover:bg-primary/20"
          : active
            ? "bg-purple text-white"
            : "bg-purple/12 text-purple hover:bg-purple/20",
      )}
    >
      {children}
    </button>
  );
}
