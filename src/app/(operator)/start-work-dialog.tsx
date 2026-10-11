"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Play } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentPicker } from "@/components/attachment-picker";
import { todayLocal } from "@/lib/utils/dates";
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
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [toolError, setToolError] = useState<string | null>(null);
  const today = todayLocal();
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch("/api/operator/work/start", { method: "POST", body: JSON.stringify(body) });
  });
  const t = (key: string) => ot(lang, key);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // The tool is compulsory (the picker's hidden input can't use native `required`).
    if (!fd.get("attachment")) {
      setToolError(t("tool.required"));
      return;
    }
    const ok = await run({
      startHourMeter: fd.get("startHourMeter"),
      startDate: fd.get("startDate"),
      attachment: fd.get("attachment"),
      siteName: fd.get("siteName") || undefined,
      dieselLiters: fd.get("dieselLiters") || undefined,
      dieselDate: fd.get("dieselDate") || undefined,
      notes: fd.get("notes") || undefined,
    });
    if (ok) {
      await mutate("/api/operator/home");
      setOpen(false);
    }
  }

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
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
            <Label htmlFor="startDate" className="text-base">
              {t("startWork.workDate")}
            </Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={today}
              max={today}
              required
              className="h-12 text-base"
            />
            <p className="text-xs text-muted-foreground">{t("startWork.workDateHelp")}</p>
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
            required
            error={toolError}
            onValueChange={() => setToolError(null)}
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

          {error && <p role="alert" className="text-sm font-medium text-destructive">{otMsg(lang, error)}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
              {pending ? t("startWork.submitting") : t("startWork.trigger")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
