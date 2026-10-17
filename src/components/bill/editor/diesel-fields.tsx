"use client";

import { formatCurrency } from "@/lib/utils/currency";
import { CheckboxField, MoneyField } from "./form-parts";

/** Diesel the customer supplied. It is an advance against the bill rather than
 * a charge, so litres x rate comes OFF the total. The deduction is on by
 * default; turning it off leaves the figures on record without applying them.
 *
 * `onLitersChange` omitted means the litres are summed from the work being
 * billed and shown read-only — the owner only types the rate. */
export function DieselDeduction({
  liters,
  rate,
  deduct,
  advance,
  onLitersChange,
  onRateChange,
  onDeductChange,
  litersNote,
}: {
  liters: string;
  rate: string;
  deduct: boolean;
  /** Preview of what will be deducted, in rupees. */
  advance: number;
  onLitersChange?: (value: string) => void;
  onRateChange: (value: string) => void;
  onDeductChange: (checked: boolean) => void;
  litersNote?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-4">
        {onLitersChange ? (
          <MoneyField label="Diesel Litres" value={liters} onChange={onLitersChange} />
        ) : (
          <div className="flex min-w-0 flex-col justify-end gap-2">
            <span className="text-sm leading-tight font-medium">Diesel Litres</span>
            <output className="flex h-11 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm font-semibold tabular-nums">
              {liters || "0"} L
            </output>
          </div>
        )}
        <MoneyField label="Diesel Rate / Litre" value={rate} onChange={onRateChange} />
      </div>

      {litersNote && <p className="-mt-1 text-xs text-muted-foreground">{litersNote}</p>}

      <CheckboxField checked={deduct} onChange={onDeductChange}>
        Deduct diesel from the total
        {advance > 0 && <span className="font-semibold tabular-nums"> (−{formatCurrency(advance)})</span>}
      </CheckboxField>
    </div>
  );
}
