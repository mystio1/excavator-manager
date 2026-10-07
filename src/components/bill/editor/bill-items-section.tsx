"use client";

import { useState, type RefObject } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils/currency";
import { rowAmount } from "./bill-math";
import { BillItemCard } from "./bill-item-card";
import { BillItemRow, GRID_COLS, GRID_MIN_REM } from "./bill-item-row";
import { Field } from "./form-parts";
import { useWideContainer } from "./use-viewport";
import type { BillFormOptions, BillTotals, Row, RowOps } from "./types";

/** The bill's lines. Where the card has room for every column (a desktop window
 * beside the sidebar) it is an Excel-like table (Enter moves down a column,
 * pasting a column fills downward); anywhere narrower — phones, tablets, a
 * small window — each row is a stacked card, so nothing needs sideways
 * scrolling. Both render the same rows through the same operations. */
export function BillItemsSection({
  rows,
  excavators,
  totals,
  ops,
  gridRef,
}: {
  rows: Row[];
  excavators: BillFormOptions["excavators"];
  totals: BillTotals;
  ops: RowOps;
  gridRef: RefObject<HTMLDivElement | null>;
}) {
  const { ref: measureRef, wide: isTable } = useWideContainer(GRID_MIN_REM);
  const [bulkRate, setBulkRate] = useState("");
  const emptyHint = "No rows yet — use Quick Fill above or add a row.";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold">
            Bill Rows <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
          </h2>
          <span role="status" className="sr-only">
            {rows.length} {rows.length === 1 ? "row" : "rows"}
          </span>
          <div className="flex w-full items-end gap-2 sm:w-auto">
            <Field label="Rate for all rows" className="min-w-0 flex-1 sm:w-36 sm:flex-none">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  enterKeyHint="done"
                  value={bulkRate}
                  onChange={(e) => setBulkRate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      ops.applyRateToAll(e.currentTarget.value);
                    }
                  }}
                  onBlur={(e) => e.currentTarget.value && ops.applyRateToAll(e.currentTarget.value)}
                  className="h-11"
                />
              )}
            </Field>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 px-3"
              onClick={ops.add}
              disabled={excavators.length === 0}
            >
              <Plus aria-hidden className="size-4" /> Row
            </Button>
          </div>
        </div>

        <div ref={measureRef} className="@container">
          {isTable ? (
            <div ref={gridRef} className="-mx-2 overflow-x-auto px-2">
              <div style={{ minWidth: `${GRID_MIN_REM}rem` }}>
                <div className={`grid ${GRID_COLS} gap-1 pb-1 text-xs font-semibold text-muted-foreground`}>
                  <span>Machine</span>
                  <span>Site</span>
                  <span>From</span>
                  <span>To</span>
                  <span>Hours</span>
                  <span>Rate</span>
                  <span>Tool</span>
                  <span className="text-right">Amount</span>
                  <span />
                </div>
                {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{emptyHint}</p>}
                {rows.map((r, i) => (
                  <BillItemRow key={r.key} row={r} index={i} excavators={excavators} amount={rowAmount(r)} ops={ops} />
                ))}
                {rows.length > 0 && (
                  <div className={`grid ${GRID_COLS} gap-1 border-t pt-2 text-sm font-bold`}>
                    <span className="col-span-4">Total</span>
                    <span className="tabular-nums">{totals.hours}</span>
                    <span />
                    <span />
                    <span className="text-right tabular-nums">{formatCurrency(totals.subtotal)}</span>
                    <span />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div ref={gridRef} className="flex flex-col gap-3">
              {rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{emptyHint}</p>}
              {rows.length > 0 && (
                <ul className="grid grid-cols-1 gap-3 @min-[600px]:grid-cols-2">
                  {rows.map((r, i) => (
                    <BillItemCard
                      key={r.key}
                      row={r}
                      index={i}
                      excavators={excavators}
                      amount={rowAmount(r)}
                      ops={ops}
                    />
                  ))}
                </ul>
              )}
              {rows.length > 0 && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full"
                    onClick={ops.add}
                    disabled={excavators.length === 0}
                  >
                    <Plus aria-hidden className="size-4" /> Add another row
                  </Button>
                  <div className="flex items-baseline justify-between gap-3 border-t pt-3 text-sm font-bold">
                    <span>
                      Total · <span className="tabular-nums">{totals.hours}</span> hrs
                    </span>
                    <span className="text-base tabular-nums">{formatCurrency(totals.subtotal)}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {isTable
            ? "Tip: press Enter to jump to the same cell on the next row (a new row is added at the end). Paste a column of hours or rates copied from Excel to fill downward."
            : "Tip: set every rate at once with “Rate for all rows”. Enter jumps to the same field on the next row (a new row is added after the last one)."}
        </p>
      </CardContent>
    </Card>
  );
}
