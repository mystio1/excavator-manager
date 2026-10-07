"use client";

import { useId, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { BillFormOptions } from "./types";

/** Small building blocks shared by the bill forms: a labelled field whose label
 * is really tied to its control, plus the chip/checkbox/alert used around it. */

/** A visible <label> bound to the control rendered by `children` (which receives
 * the control's id). Wrapped labels stack above the control and the control sits
 * at the bottom, so side-by-side fields stay aligned when one label wraps. */
export function Field({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col justify-end gap-2", className)}>
      <Label htmlFor={id} className="leading-tight">
        {label}
      </Label>
      {children(id)}
    </div>
  );
}

/** A non-negative decimal amount held as typed text. `step="any"` because rates,
 * hours and charges legitimately have paise (the server keeps 2 decimals) and
 * the browser's default step of 1 would otherwise block saving them. */
export function MoneyField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Field label={label} className={className}>
      {(id) => (
        <Input
          id={id}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11"
        />
      )}
    </Field>
  );
}

/** Option list for a machine <select>. */
export function MachineOptions({ excavators }: { excavators: BillFormOptions["excavators"] }) {
  return (
    <>
      {excavators.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
          {m.machineNumber ? ` (${m.machineNumber})` : ""}
        </option>
      ))}
    </>
  );
}

export const TOOL_OPTIONS = ["Bucket", "Breaker"] as const;

/** A pressable chip (machine picker, GST rate). 44px tall, visible focus ring. */
export function ChoiceChip({
  selected,
  onClick,
  className,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-muted/40 hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A checkbox whose whole row is the tap target. */
export function CheckboxField({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 cursor-pointer"
      />
      {children}
    </label>
  );
}

/** An error the screen reader announces as soon as it appears. */
export function FormAlert({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className={cn("text-sm font-medium text-red-700 dark:text-red-400", className)}>
      {children}
    </p>
  );
}

/** id of the <datalist> that suggests site names to every "site" input. */
export const SITE_LIST_ID = "bill-sites";

export function SiteSuggestions({ sites }: { sites: BillFormOptions["sites"] }) {
  return (
    <datalist id={SITE_LIST_ID}>
      {sites.map((s) => (
        <option key={s.id} value={s.name} />
      ))}
    </datalist>
  );
}
