"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import type { BillTotals, BillType } from "./types";

function Line({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-muted-foreground">
      <dt>{label}</dt>
      <dd className="shrink-0 tabular-nums">
        {negative ? "-" : ""}
        {formatCurrency(value)}
      </dd>
    </div>
  );
}

/** The review card: how the total is made up, so the lines always add up to it. */
export function BillSummary({
  totals,
  isDirect,
  billType,
  gstPercentage,
}: {
  totals: BillTotals;
  isDirect: boolean;
  billType: BillType;
  gstPercentage: number;
}) {
  return (
    <Card>
      <CardContent>
        <h2 className="mb-2 text-base font-semibold">Review Amount</h2>
        <dl className="flex flex-col gap-1.5 text-sm">
          <Line label={isDirect ? "Bucket + Breaker" : `Hours × Rate (${totals.hours} hrs)`} value={totals.subtotal} />
          {totals.charges > 0 && (
            <Line label={isDirect ? "Transport" : "Transport, fuel & extra"} value={totals.charges} />
          )}
          {totals.discount > 0 && <Line label="Discount" value={totals.discount} negative />}
          {billType === "GST" && <Line label={`GST (${gstPercentage}%)`} value={totals.tax} />}
          {totals.dieselAdvance > 0 && <Line label="Diesel Advance" value={totals.dieselAdvance} negative />}
          <div className="mt-2 flex justify-between gap-3 border-t pt-2 text-lg font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCurrency(totals.total)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
