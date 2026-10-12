"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Fuel } from "lucide-react";
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

/** "Diesel only": diesel was taken but there is no work to report. Only the
 * litres and the date are required — the tool and a note are optional, and the
 * hour meter is not asked for (the server uses the previous ending reading). */
export function DieselOnlyDialog({ lang }: { lang: OperatorLang }) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [confirmSkipRemaining, setConfirmSkipRemaining] = useState(false);
  const today = todayLocal();
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch("/api/operator/diesel", { method: "POST", body: JSON.stringify(body) });
  });
  const t = (key: string) => ot(lang, key);

  async function submit(fd: FormData, skipRemainingCheck = false) {
    const remaining = fd.get("remainingDieselLiters");
    if (!skipRemainingCheck && (!remaining || remaining === "")) {
      setConfirmSkipRemaining(true);
      return;
    }
    const ok = await run({
      dieselLiters: fd.get("dieselLiters"),
      remainingDieselLiters: remaining || undefined,
      date: fd.get("date"),
      attachment: fd.get("attachment") || undefined,
      notes: fd.get("notes") || undefined,
    });
    if (ok) {
      await mutate("/api/operator/home");
      setOpen(false);
    }
  }

  function handleOpen(v: boolean) {
    setOpen(v);
    if (!v) setConfirmSkipRemaining(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger render={<Button size="lg" variant="secondary" className="h-12 w-full text-base" />}>
        <Fuel className="size-5" />
        {t("dieselOnly.trigger")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dieselOnly.title")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-muted-foreground">{t("dieselOnly.help")}</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="diesel-only-liters" className="text-base">
                {t("dieselOnly.litres")}
              </Label>
              <Input
                id="diesel-only-liters"
                name="dieselLiters"
                type="number"
                step="0.1"
                min="0.1"
                required
                className="h-12 text-base"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="diesel-only-date" className="text-base">
                {t("dieselOnly.date")}
              </Label>
              <Input
                id="diesel-only-date"
                name="date"
                type="date"
                defaultValue={today}
                max={today}
                required
                className="h-12 text-base"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="diesel-only-remaining" className="text-base">
              Diesel left in tank after this fill (L)
            </Label>
            <Input
              id="diesel-only-remaining"
              name="remainingDieselLiters"
              type="number"
              step="0.1"
              min="0"
              placeholder="e.g. 70"
              className="h-12 text-base"
              onChange={() => setConfirmSkipRemaining(false)}
            />
            <p className="text-xs text-muted-foreground">
              How many litres were left before you filled up? Used to calculate consumption rate.
            </p>
          </div>

          {confirmSkipRemaining && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-3 text-sm">
              <p className="font-semibold text-amber-700 dark:text-amber-300">
                No remaining diesel entered
              </p>
              <p className="mt-1 text-amber-700/80 dark:text-amber-300/80">
                Without it, we can&apos;t calculate the actual consumption rate. Are you sure you want to skip?
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="submit"
                  onClick={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget.closest("form") as HTMLFormElement;
                    submit(new FormData(form), true);
                  }}
                  className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-semibold text-white"
                >
                  Yes, skip remaining
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmSkipRemaining(false)}
                  className="flex-1 rounded-lg bg-muted py-2 text-sm font-semibold text-foreground"
                >
                  Enter it
                </button>
              </div>
            </div>
          )}

          <AttachmentPicker
            name="attachment"
            label={t("dieselOnly.attachment")}
            optionLabels={{ Bucket: t("tool.bucket"), Breaker: t("tool.breaker"), Chaining: t("tool.chaining") }}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="diesel-only-notes" className="text-base">
              {t("dieselOnly.note")}
            </Label>
            <Textarea id="diesel-only-notes" name="notes" placeholder={t("startWork.notePlaceholder")} className="min-h-20" />
          </div>

          {error && <p role="alert" className="text-sm font-medium text-destructive">{otMsg(lang, error)}</p>}

          {!confirmSkipRemaining && (
            <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
                {pending ? t("dieselOnly.submitting") : t("dieselOnly.submit")}
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
