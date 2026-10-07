"use client";

import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { formatCurrency } from "@/lib/utils/currency";
import { Field, MachineOptions, SITE_LIST_ID, TOOL_OPTIONS } from "./form-parts";
import type { BillFormOptions, Row, RowOps } from "./types";

/** One bill row as a stacked card for phones. Every field has a visible label
 * (repeated per card) and an aria-label that adds the row number so a screen
 * reader can tell the cards apart. Keeps the grid's Enter-to-next-row flow. */
export function BillItemCard({
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
    <li className="@container rounded-xl border border-border bg-muted/30 p-3 dark:bg-background/40">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">Row {n}</h3>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            aria-label={`Duplicate row ${n}`}
            onClick={() => ops.duplicate(row.key)}
          >
            <Copy aria-hidden className="size-5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 text-muted-foreground hover:text-destructive"
            aria-label={`Remove row ${n}`}
            onClick={() => ops.remove(row.key)}
          >
            <Trash2 aria-hidden className="size-5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Machine" className="col-span-2">
          {(id) => (
            <NativeSelect
              id={id}
              data-cell={`${index}-machine`}
              aria-label={`Machine, row ${n}`}
              value={row.excavatorId}
              onChange={(e) => ops.setMachine(row.key, e.target.value)}
              onKeyDown={(e) => ops.onCellKeyDown(e, index, "machine")}
              className="h-11 min-w-0"
            >
              <MachineOptions excavators={excavators} />
            </NativeSelect>
          )}
        </Field>
        <Field label="Site" className="col-span-2">
          {(id) => (
            <Input
              id={id}
              data-cell={`${index}-site`}
              aria-label={`Site, row ${n}`}
              list={SITE_LIST_ID}
              enterKeyHint="next"
              value={row.siteName}
              onChange={(e) => ops.update(row.key, { siteName: e.target.value })}
              onKeyDown={(e) => ops.onCellKeyDown(e, index, "site")}
              className="h-11"
            />
          )}
        </Field>
        <Field label="From" className="col-span-2 @min-[302px]:col-span-1">
          {(id) => (
            <Input
              id={id}
              data-cell={`${index}-from`}
              aria-label={`From date, row ${n}`}
              type="date"
              value={row.fromDate}
              onChange={(e) => ops.setFromDate(row.key, e.target.value)}
              onKeyDown={(e) => ops.onCellKeyDown(e, index, "from")}
              className="h-11 px-2"
            />
          )}
        </Field>
        <Field label="To" className="col-span-2 @min-[302px]:col-span-1">
          {(id) => (
            <Input
              id={id}
              data-cell={`${index}-to`}
              aria-label={`To date, row ${n}`}
              type="date"
              min={row.fromDate}
              value={row.toDate}
              onChange={(e) => ops.update(row.key, { toDate: e.target.value })}
              onKeyDown={(e) => ops.onCellKeyDown(e, index, "to")}
              className="h-11 px-2"
            />
          )}
        </Field>
        <Field label="Hours">
          {(id) => (
            <Input
              id={id}
              data-cell={`${index}-hours`}
              aria-label={`Hours, row ${n}`}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              enterKeyHint="next"
              value={row.hours}
              onChange={(e) => ops.update(row.key, { hours: e.target.value })}
              onKeyDown={(e) => ops.onCellKeyDown(e, index, "hours")}
              onPaste={(e) => ops.onNumberPaste(e, index, "hours")}
              className="h-11"
            />
          )}
        </Field>
        <Field label="Rate">
          {(id) => (
            <Input
              id={id}
              data-cell={`${index}-rate`}
              aria-label={`Rate, row ${n}`}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              enterKeyHint="next"
              value={row.rate}
              onChange={(e) => ops.update(row.key, { rate: e.target.value })}
              onKeyDown={(e) => ops.onCellKeyDown(e, index, "rate")}
              onPaste={(e) => ops.onNumberPaste(e, index, "rate")}
              className="h-11"
            />
          )}
        </Field>
        <Field label="Tool" className="col-span-2">
          {(id) => (
            <NativeSelect
              id={id}
              aria-label={`Tool, row ${n}`}
              value={row.attachment}
              onChange={(e) => ops.update(row.key, { attachment: e.target.value })}
              className="h-11 min-w-0"
            >
              <option value="">None</option>
              {TOOL_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t pt-2">
        <span className="text-sm font-medium text-muted-foreground">Amount</span>
        <span className="text-lg font-bold tabular-nums">{formatCurrency(amount)}</span>
      </div>
    </li>
  );
}
