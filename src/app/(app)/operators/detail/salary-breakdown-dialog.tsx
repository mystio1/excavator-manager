"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { getLifetimeSalarySummary } from "@/lib/services/salary";
import { formatCurrency, formatCurrencyPrecise } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type LifetimeSalary = Awaited<ReturnType<typeof getLifetimeSalarySummary>>;

/** Shows the exact arithmetic behind the Overview tab's "Since Joining"
 * numbers — every figure here comes straight from getLifetimeSalarySummary,
 * never re-derived or approximated on the client, so it can never drift
 * from what's actually displayed. */
export function SalaryBreakdownDialog({ lifetimeSalary }: { lifetimeSalary: LifetimeSalary }) {
  const [open, setOpen] = useState(false);
  const { accrual, baseSalary, bonus, deductions, totalPaid, totalPayable, remaining } = lifetimeSalary;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" className="self-start text-primary" />}>
        <Info className="size-4" />
        Detail
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How This Was Calculated</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            Joined {formatDate(lifetimeSalary.joiningDate)}, calculated through today, {formatDate(lifetimeSalary.asOf)}.
          </p>

          {accrual.fullCycles > 0 && (
            <div className="rounded-lg border p-3">
              <p className="font-semibold">
                {accrual.fullCycles} full month{accrual.fullCycles === 1 ? "" : "s"}
              </p>
              <p className="text-muted-foreground">
                {formatDate(lifetimeSalary.joiningDate)} – {formatDate(accrual.cycleStart)}
              </p>
              <p className="mt-1">
                {formatCurrency(baseSalary)} × {accrual.fullCycles} ={" "}
                <strong>{formatCurrencyPrecise(accrual.fullCyclesAmount)}</strong>
              </p>
            </div>
          )}

          {accrual.elapsedDays > 0 && (
            <div className="rounded-lg border p-3">
              <p className="font-semibold">
                {accrual.elapsedDays} more day{accrual.elapsedDays === 1 ? "" : "s"}
              </p>
              <p className="text-muted-foreground">
                {formatDate(accrual.cycleStart)} – {formatDate(lifetimeSalary.asOf)}, inside the current{" "}
                {accrual.cycleDays}-day cycle ({formatDate(accrual.cycleStart)} – {formatDate(accrual.cycleEnd)})
              </p>
              <p className="mt-1">
                {formatCurrency(baseSalary)} ÷ {accrual.cycleDays} days = {formatCurrencyPrecise(accrual.dailyRate)}/day ×{" "}
                {accrual.elapsedDays} = <strong>{formatCurrencyPrecise(accrual.partialAmount)}</strong>
              </p>
            </div>
          )}

          {(bonus > 0 || deductions > 0) && (
            <div className="flex flex-col gap-1 rounded-lg border p-3">
              {bonus > 0 && (
                <p className="flex justify-between">
                  <span>Bonus / Incentive</span>
                  <strong className="text-working">+{formatCurrencyPrecise(bonus)}</strong>
                </p>
              )}
              {deductions > 0 && (
                <p className="flex justify-between">
                  <span>Deductions</span>
                  <strong className="text-destructive">-{formatCurrencyPrecise(deductions)}</strong>
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1 border-t pt-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Payable</span>
              <span className="font-semibold">{formatCurrencyPrecise(totalPayable)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Salary Given</span>
              <span className="font-semibold">{formatCurrencyPrecise(totalPaid)}</span>
            </div>
            <div className="flex justify-between text-base">
              <span className="font-semibold">Remaining</span>
              <span className="font-bold">{formatCurrencyPrecise(remaining)}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
