"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { submitReadingAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ot, otMsg, type OperatorLang } from "@/lib/i18n/operator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SubmitReadingDialog({
  workSessionId,
  currentHourMeter,
  lang,
}: {
  workSessionId: string;
  currentHourMeter: number;
  lang: OperatorLang;
}) {
  const [state, formAction, isPending] = useActionState(submitReadingAction, undefined);
  const [mode, setMode] = useState<"meter" | "time">("meter");
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const wasPending = useRef(false);
  const t = (key: string) => ot(lang, key);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" className="h-12 w-full text-base" />}>
        <Clock className="size-5" />
        {t("submitReading.trigger")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("submitReading.title")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="workSessionId" value={workSessionId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="date" className="text-base">
              {t("submitReading.date")}
            </Label>
            <Input id="date" name="date" type="date" defaultValue={today} required className="h-12 text-base" />
          </div>

          <div className="flex gap-2 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setMode("meter")}
              className={cn(
                "flex-1 rounded-md py-2 text-sm font-semibold",
                mode === "meter" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {t("submitReading.hourMeter")}
            </button>
            <button
              type="button"
              onClick={() => setMode("time")}
              className={cn(
                "flex-1 rounded-md py-2 text-sm font-semibold",
                mode === "time" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {t("submitReading.startStopTime")}
            </button>
          </div>

          {mode === "meter" ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="startHourMeter" className="text-base">
                  {t("submitReading.startMeter")}
                </Label>
                <Input
                  id="startHourMeter"
                  name="startHourMeter"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={currentHourMeter}
                  className="h-12 text-base"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="endHourMeter" className="text-base">
                  {t("submitReading.endMeter")}
                </Label>
                <Input id="endHourMeter" name="endHourMeter" type="number" step="0.1" min="0" className="h-12 text-base" />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="startTime" className="text-base">
                    {t("submitReading.startTime")}
                  </Label>
                  <Input id="startTime" name="startTime" type="time" className="h-12 text-base" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="stopTime" className="text-base">
                    {t("submitReading.stopTime")}
                  </Label>
                  <Input id="stopTime" name="stopTime" type="time" className="h-12 text-base" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="breakMinutes" className="text-base">
                  {t("submitReading.breakMinutes")}
                </Label>
                <Input
                  id="breakMinutes"
                  name="breakMinutes"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={0}
                  className="h-12 text-base"
                />
              </div>
            </>
          )}

          {state?.error && <p className="text-sm font-medium text-destructive">{otMsg(lang, state.error)}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={isPending}>
              {isPending ? t("submitReading.submitting") : t("submitReading.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
