"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Play } from "lucide-react";
import { ApiError, apiFetch, newIdempotencyKey, swrFetcher } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { toDateInputValue, todayLocal } from "@/lib/utils/dates";
import { LEAVE_TYPES, LEAVE_TYPE_LABEL, START_REASONS, START_REASON_LABEL } from "@/lib/validation/operatorPeriod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Preview = {
  previousSession: number;
  gapDays: number;
  pending: number;
  needsCarryDecision: boolean;
};

const shiftDay = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateInputValue(d);
};

export function StartSessionDialog({
  operatorId,
  activeVersion,
  defaultMonthlySalary,
}: {
  operatorId: string;
  /** Version of the ACTIVE period being closed, for the conflict check. */
  activeVersion?: number;
  defaultMonthlySalary: number;
}) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayLocal());
  const [previousEndDate, setPreviousEndDate] = useState(() => shiftDay(todayLocal(), -1));
  const [carryForward, setCarryForward] = useState<boolean | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const previewKey =
    open && startDate && previousEndDate
      ? `/api/operators/${operatorId}/periods?previewStart=${startDate}&previewEnd=${previousEndDate}`
      : null;
  const { data, error: previewError } = useSWR<{ preview: Preview }>(previewKey, swrFetcher);
  const preview = data?.preview;
  const owed = (preview?.pending ?? 0) > 0;
  const mustChoose = preview?.needsCarryDecision === true;

  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    try {
      await apiFetch(`/api/operators/${operatorId}/periods`, {
        method: "POST",
        body: JSON.stringify(body),
        idempotencyKey,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "IDEMPOTENCY_KEY_REUSED") setIdempotencyKey(newIdempotencyKey());
      throw err;
    }
  });

  function onOpenChange(next: boolean) {
    if (next) {
      const today = todayLocal();
      setIdempotencyKey(newIdempotencyKey());
      setStartDate(today);
      setPreviousEndDate(shiftDay(today, -1));
      setCarryForward(null);
    }
    setOpen(next);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      startDate,
      previousEndDate,
      reason: fd.get("reason") || undefined,
      reasonText: fd.get("reasonText") || undefined,
      leaveType: fd.get("leaveType") || undefined,
      monthlySalary: fd.get("monthlySalary") || undefined,
      notes: fd.get("notes") || undefined,
      ...(owed ? { carryForward: carryForward === true } : {}),
      expectedVersion: activeVersion,
    });
    if (ok) {
      setIdempotencyKey(newIdempotencyKey());
      await mutate((key) => typeof key === "string" && key.startsWith(`/api/operators/`));
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="lg" className="h-11" />}>
        <Play className="size-4" />
        Start New Session
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start New Session</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="previousEndDate" className="text-base">
                Previous Session Ends
              </Label>
              <Input
                id="previousEndDate"
                type="date"
                value={previousEndDate}
                onChange={(e) => setPreviousEndDate(e.target.value)}
                required
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="startDate" className="text-base">
                New Session Starts
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCarryForward(null);
                }}
                required
                className="h-12 text-base"
              />
            </div>
          </div>

          {preview && (
            <div className="rounded-lg border bg-muted/40 px-3 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Closing</span>
                <span className="font-semibold">Session #{preview.previousSession}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Holiday gap</span>
                <span className="font-semibold">{preview.gapDays} days</span>
              </div>
              <div className="mt-1 flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Outstanding on that session</span>
                <span className={cn("font-bold", owed ? "text-working" : "")}>{formatCurrency(preview.pending)}</span>
              </div>
            </div>
          )}
          {previewError && (
            <p className="text-sm text-muted-foreground">
              Pick dates where the new session starts after the previous one ends.
            </p>
          )}

          {preview && preview.gapDays > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="leaveType" className="text-base">
                The {preview.gapDays}-day gap is
              </Label>
              <NativeSelect id="leaveType" name="leaveType" defaultValue="UNPAID" className="h-12 text-base">
                {LEAVE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {LEAVE_TYPE_LABEL[v]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          {mustChoose && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-3 text-sm">
              <p className="font-semibold text-amber-700 dark:text-amber-300">
                {formatCurrency(preview!.pending)} is still owed on Session #{preview!.previousSession}
              </p>
              <p className="mt-1 text-amber-700/80 dark:text-amber-300/80">
                Carry it into the new session, or leave it on the old one?
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setCarryForward(true)}
                  className={cn(
                    "flex-1 rounded-lg border py-2 text-sm font-semibold",
                    carryForward === true ? "border-amber-500 bg-amber-500 text-white" : "border-amber-500/40 text-amber-700 dark:text-amber-300",
                  )}
                >
                  Carry Forward
                </button>
                <button
                  type="button"
                  onClick={() => setCarryForward(false)}
                  className={cn(
                    "flex-1 rounded-lg border py-2 text-sm font-semibold",
                    carryForward === false ? "border-foreground bg-muted text-foreground" : "border-border text-muted-foreground",
                  )}
                >
                  Keep Separate
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="reason" className="text-base">
                Reason
              </Label>
              <NativeSelect id="reason" name="reason" defaultValue="RETURNED_FROM_LEAVE" className="h-12 text-base">
                {START_REASONS.map((v) => (
                  <option key={v} value={v}>
                    {START_REASON_LABEL[v]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="monthlySalary" className="text-base">
                Monthly Salary
              </Label>
              <Input
                id="monthlySalary"
                name="monthlySalary"
                type="number"
                step="0.01"
                min="0"
                defaultValue={defaultMonthlySalary}
                className="h-12 text-base"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="notes" className="text-base">
              Note (Optional)
            </Label>
            <Textarea id="notes" name="notes" className="min-h-20" />
          </div>

          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button
              type="submit"
              size="lg"
              className="h-12 w-full text-base"
              disabled={pending || (mustChoose && carryForward === null)}
            >
              {pending ? "Starting..." : mustChoose && carryForward === null ? "Choose carry forward first" : "Start Session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
