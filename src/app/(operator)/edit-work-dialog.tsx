"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Pencil } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
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

export function EditWorkDialog({
  requestId,
  status,
  startHourMeter,
  endHourMeter,
  attachment,
  siteName,
  dieselLiters,
  dieselDate,
  notes,
  lang,
}: {
  requestId: string;
  status: "ACTIVE" | "PENDING";
  startHourMeter: number;
  endHourMeter: number | null;
  attachment: string | null;
  siteName: string | null;
  dieselLiters: number | null;
  dieselDate: Date | null;
  notes: string | null;
  lang: OperatorLang;
}) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch("/api/operator/work/edit", { method: "POST", body: JSON.stringify(body) });
  });
  const t = (key: string) => ot(lang, key);

  const dieselDateValue = dieselDate ? dieselDate.toISOString().slice(0, 10) : "";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      requestId,
      startHourMeter: fd.get("startHourMeter"),
      endHourMeter: fd.get("endHourMeter") || undefined,
      attachment: fd.get("attachment") || undefined,
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
      <DialogTrigger render={<Button size="sm" variant="secondary" />}>
        <Pencil className="size-3.5" />
        {t("edit.trigger")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editWork.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-startHourMeter-${requestId}`} className="text-base">
              {t("editWork.startingHourMeter")}
            </Label>
            <Input
              key={startHourMeter}
              id={`edit-startHourMeter-${requestId}`}
              name="startHourMeter"
              type="number"
              step="0.1"
              min="0"
              defaultValue={startHourMeter}
              required
              className="h-12 text-base"
              autoFocus
            />
          </div>

          {status === "PENDING" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edit-endHourMeter-${requestId}`} className="text-base">
                {t("editWork.endingHourMeter")}
              </Label>
              <Input
                key={endHourMeter}
                id={`edit-endHourMeter-${requestId}`}
                name="endHourMeter"
                type="number"
                step="0.1"
                min="0"
                defaultValue={endHourMeter ?? undefined}
                required
                className="h-12 text-base"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-siteName-${requestId}`} className="text-base">
              {t("editWork.site")}
            </Label>
            <Input
              key={siteName}
              id={`edit-siteName-${requestId}`}
              name="siteName"
              placeholder={t("startWork.sitePlaceholder")}
              defaultValue={siteName ?? ""}
              className="h-12 text-base"
            />
          </div>

          <AttachmentPicker
            key={attachment}
            name="attachment"
            defaultValue={attachment}
            label={t("editWork.attachment")}
            optionLabels={{ Bucket: t("tool.bucket"), Breaker: t("tool.breaker"), Chaining: t("tool.chaining") }}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edit-dieselLiters-${requestId}`} className="text-base">
                {t("editWork.dieselReceived")}
              </Label>
              <Input
                key={dieselLiters}
                id={`edit-dieselLiters-${requestId}`}
                name="dieselLiters"
                type="number"
                step="0.1"
                min="0"
                defaultValue={dieselLiters ?? undefined}
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edit-dieselDate-${requestId}`} className="text-base">
                {t("editWork.dieselDate")}
              </Label>
              <Input
                key={dieselDateValue}
                id={`edit-dieselDate-${requestId}`}
                name="dieselDate"
                type="date"
                defaultValue={dieselDateValue}
                className="h-12 text-base"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-notes-${requestId}`} className="text-base">
              {t("editWork.note")}
            </Label>
            <Textarea
              key={notes}
              id={`edit-notes-${requestId}`}
              name="notes"
              defaultValue={notes ?? ""}
              placeholder={t("startWork.notePlaceholder")}
              className="min-h-20"
            />
          </div>

          {error && <p className="text-sm font-medium text-destructive">{otMsg(lang, error)}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
              {pending ? t("editWork.submitting") : t("editWork.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
