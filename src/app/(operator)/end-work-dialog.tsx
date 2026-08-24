"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import { endOperatorWorkAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ot, otMsg, type OperatorLang } from "@/lib/i18n/operator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EndWorkDialog({
  requestId,
  currentHourMeter,
  triggerLabel,
  lang,
}: {
  requestId: string;
  currentHourMeter: number;
  triggerLabel?: string;
  lang: OperatorLang;
}) {
  const [state, formAction, isPending] = useActionState(endOperatorWorkAction, undefined);
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
      <DialogTrigger
        render={
          <Button
            size="lg"
            variant="outline"
            className="h-12 w-full border-destructive text-destructive text-base hover:bg-destructive/10"
          />
        }
      >
        <Square className="size-5" />
        {triggerLabel ?? t("endWork.trigger")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("endWork.title")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="requestId" value={requestId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`endHourMeter-${requestId}`} className="text-base">
              {t("endWork.endingHourMeter")}
            </Label>
            <Input
              key={currentHourMeter}
              id={`endHourMeter-${requestId}`}
              name="endHourMeter"
              type="number"
              step="0.1"
              min="0"
              defaultValue={currentHourMeter}
              required
              className="h-12 text-base"
              autoFocus
            />
          </div>

          <p className="text-xs text-muted-foreground">{t("endWork.help")}</p>

          {state?.error && <p className="text-sm font-medium text-destructive">{otMsg(lang, state.error)}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={isPending}>
              {isPending ? t("endWork.submitting") : t("endWork.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
