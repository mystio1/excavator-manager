"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { startOperatorWorkAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentPicker } from "@/components/attachment-picker";
import { ot, otMsg, type OperatorLang } from "@/lib/i18n/operator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function StartWorkDialog({
  currentHourMeter,
  currentSiteName,
  lang,
}: {
  currentHourMeter: number;
  currentSiteName: string | null;
  lang: OperatorLang;
}) {
  const [state, formAction, isPending] = useActionState(startOperatorWorkAction, undefined);
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
        <Play className="size-5" />
        {t("startWork.trigger")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("startWork.title")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="startHourMeter" className="text-base">
              {t("startWork.startingHourMeter")}
            </Label>
            <Input
              key={currentHourMeter}
              id="startHourMeter"
              name="startHourMeter"
              type="number"
              step="0.1"
              min="0"
              defaultValue={currentHourMeter}
              required
              className="h-12 text-base"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="siteName" className="text-base">
              {t("startWork.site")}
            </Label>
            <Input
              key={currentSiteName}
              id="siteName"
              name="siteName"
              placeholder={t("startWork.sitePlaceholder")}
              defaultValue={currentSiteName ?? ""}
              className="h-12 text-base"
            />
            <p className="text-xs text-muted-foreground">
              {currentSiteName ? t("startWork.siteHelpSet") : t("startWork.siteHelpUnset")}
            </p>
          </div>

          <AttachmentPicker
            name="attachment"
            label={t("startWork.attachment")}
            optionLabels={{ Bucket: t("tool.bucket"), Breaker: t("tool.breaker"), Chaining: t("tool.chaining") }}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dieselLiters" className="text-base">
                {t("startWork.dieselReceived")}
              </Label>
              <Input id="dieselLiters" name="dieselLiters" type="number" step="0.1" min="0" className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dieselDate" className="text-base">
                {t("startWork.dieselDate")}
              </Label>
              <Input id="dieselDate" name="dieselDate" type="date" className="h-12 text-base" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="notes" className="text-base">
              {t("startWork.note")}
            </Label>
            <Textarea id="notes" name="notes" placeholder={t("startWork.notePlaceholder")} className="min-h-20" />
          </div>

          {state?.error && <p className="text-sm font-medium text-destructive">{otMsg(lang, state.error)}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={isPending}>
              {isPending ? t("startWork.submitting") : t("startWork.trigger")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
