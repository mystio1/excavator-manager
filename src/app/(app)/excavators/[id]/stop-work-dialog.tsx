"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import { stopWorkAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function StopWorkDialog({
  excavatorId,
  workSessionId,
  currentHourMeter,
}: {
  excavatorId: string;
  workSessionId: string;
  currentHourMeter: number;
}) {
  const [state, formAction, isPending] = useActionState(stopWorkAction, undefined);
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="lg"
            variant="outline"
            className="h-12 flex-1 border-destructive text-destructive text-base hover:bg-destructive/10"
          />
        }
      >
        <Square className="size-5" />
        Stop Work
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stop Work</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="excavatorId" value={excavatorId} />
          <input type="hidden" name="workSessionId" value={workSessionId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="endDate" className="text-base">
              End Date
            </Label>
            <Input id="endDate" name="endDate" type="date" defaultValue={today} required className="h-12 text-base" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="endHourMeter" className="text-base">
              Final Hour Meter
            </Label>
            <Input
              id="endHourMeter"
              name="endHourMeter"
              type="number"
              step="0.1"
              min="0"
              defaultValue={currentHourMeter}
              required
              className="h-12 text-base"
            />
          </div>

          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={isPending}>
              {isPending ? "Stopping..." : "Confirm Stop Work"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
