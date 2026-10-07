"use client";

import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { formatCurrency } from "@/lib/utils/currency";
import { MachineOptions, SITE_LIST_ID, TOOL_OPTIONS } from "./form-parts";
import type { BillFormOptions, Row, RowOps } from "./types";

/** Column template shared by the header, every row and the totals line. */
export const GRID_COLS =
  "grid-cols-[minmax(4.5rem,1.3fr)_minmax(4.5rem,1.2fr)_minmax(7.5rem,1fr)_minmax(7.5rem,1fr)_minmax(4.5rem,0.6fr)_minmax(5.25rem,0.8fr)_minmax(5.5rem,0.8fr)_minmax(4.5rem,0.8fr)_4.5rem]";
/** Narrowest container the columns above fit in: their minimums plus the gaps.
 * In rem because the minimums are — text (and so every cell) scales with the
 * root font size. */
export const GRID_MIN_REM = 50.5;

const cellClass = "h-10 px-2 text-sm";
/** Number cells hide the browser's spin buttons: they take ~15px of a narrow
 * cell (clipping a 4-digit rate) and nobody steps an Excel-style cell with them. */
const numberCellClass = `${cellClass} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

/** One grid line of the desktop table. The columns have a header line above
 * them rather than labels, so each control carries an aria-label with its row. */
export function BillItemRow({
  row,
  index,
  excavators,
  amount,
  ops,
}: {
  row: Row;
  index: number;
  excavators: BillFormOptions["excavators"];
  amount: number;
  ops: RowOps;
}) {
  const n = index + 1;
  return (
    <div className={`grid ${GRID_COLS} items-center gap-1 border-t py-1.5`}>
      <NativeSelect
        data-cell={`${index}-machine`}
        aria-label={`Machine, row ${n}`}
        value={row.excavatorId}
        onChange={(e) => ops.setMachine(row.key, e.target.value)}
        onKeyDown={(e) => ops.onCellKeyDown(e, index, "machine")}
        className={`${cellClass} min-w-0`}
      >
        <MachineOptions excavators={excavators} />
      </NativeSelect>
      <Input
        data-cell={`${index}-site`}
        aria-label={`Site, row ${n}`}
        list={SITE_LIST_ID}
        value={row.siteName}
        onChange={(e) => ops.update(row.key, { siteName: e.target.value })}
        onKeyDown={(e) => ops.onCellKeyDown(e, index, "site")}
        className={cellClass}
      />
      <Input
        data-cell={`${index}-from`}
        aria-label={`From date, row ${n}`}
        type="date"
        value={row.fromDate}
        onChange={(e) => ops.setFromDate(row.key, e.target.value)}
        onKeyDown={(e) => ops.onCellKeyDown(e, index, "from")}
        className={cellClass}
      />
      <Input
        data-cell={`${index}-to`}
        aria-label={`To date, row ${n}`}
        type="date"
        min={row.fromDate}
        value={row.toDate}
        onChange={(e) => ops.update(row.key, { toDate: e.target.value })}
        onKeyDown={(e) => ops.onCellKeyDown(e, index, "to")}
        className={cellClass}
      />
      <Input
        data-cell={`${index}-hours`}
        aria-label={`Hours, row ${n}`}
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        value={row.hours}
        onChange={(e) => ops.update(row.key, { hours: e.target.value })}
        onKeyDown={(e) => ops.onCellKeyDown(e, index, "hours")}
        onPaste={(e) => ops.onNumberPaste(e, index, "hours")}
        className={numberCellClass}
      />
      <Input
        data-cell={`${index}-rate`}
        aria-label={`Rate, row ${n}`}
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        value={row.rate}
        onChange={(e) => ops.update(row.key, { rate: e.target.value })}
        onKeyDown={(e) => ops.onCellKeyDown(e, index, "rate")}
        onPaste={(e) => ops.onNumberPaste(e, index, "rate")}
        className={numberCellClass}
      />
      <NativeSelect
        aria-label={`Tool, row ${n}`}
        value={row.attachment}
        onChange={(e) => ops.update(row.key, { attachment: e.target.value })}
        className={`${cellClass} min-w-0`}
      >
        <option value="">—</option>
        {TOOL_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </NativeSelect>
      <span className="text-right text-sm font-semibold tabular-nums">{formatCurrency(amount)}</span>
      <div className="flex justify-end gap-0.5">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Duplicate row ${n}`} onClick={() => ops.duplicate(row.key)}>
          <Copy aria-hidden className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove row ${n}`}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => ops.remove(row.key)}
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  );
}
