"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Pencil } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AttachmentPicker } from "@/components/attachment-picker";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type EditableLog = {
  id: string;
  date: string | Date;
  startTime: string | null;
  stopTime: string | null;
  breakMinutes: number | null;
  startHourMeter: number | null;
  endHourMeter: number | null;
  operatorName: string | null;
  dieselLiters: number | null;
  notes: string | null;
  attachment: string | null;
};

/** Admin can correct any reading at any time — pending, approved or
 * rejected; hours, session totals and diesel re-derive server-side. */
export function EditReadingButton({ log, invalidateKey }: { log: EditableLog; invalidateKey: string }) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"meter" | "time">(
    log.startHourMeter != null && log.endHourMeter != null ? "meter" : "time",
  );
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch(`/api/daily-logs/${log.id}`, { method: "PATCH", body: JSON.stringify(body) });
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      date: fd.get("date"),
      startHourMeter: mode === "meter" ? fd.get("startHourMeter") || undefined : undefined,
      endHourMeter: mode === "meter" ? fd.get("endHourMeter") || undefined : undefined,
      startTime: mode === "time" ? fd.get("startTime") || undefined : undefined,
      stopTime: mode === "time" ? fd.get("stopTime") || undefined : undefined,
      breakMinutes: mode === "time" ? fd.get("breakMinutes") || undefined : undefined,
      operatorName: fd.get("operatorName") || undefined,
      dieselLiters: fd.get("dieselLiters") || undefined,
      notes: fd.get("notes") || undefined,
      attachment: fd.get("attachment") || undefined,
    });
    if (ok) {
      await mutate(invalidateKey);
      await mutate((key) => typeof key === "string" && key.startsWith("/api/excavators"));
      setOpen(false);
    }
  }

  const dateValue = new Date(log.date).toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Edit reading"
          />
        }
      >
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Reading</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label className="text-base">Date</Label>
            <Input name="date" type="date" defaultValue={dateValue} required className="h-12 text-base" />
          </div>

          <div className="flex gap-2 rounded-lg bg-muted p-1">
            {(["meter", "time"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 rounded-md py-2 text-sm font-semibold",
                  mode === m ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                {m === "meter" ? "Hour Meter" : "Start / Stop Time"}
              </button>
            ))}
          </div>

          {mode === "meter" ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label className="text-base">Start Meter</Label>
                <Input name="startHourMeter" type="number" step="0.1" min="0" defaultValue={log.startHourMeter ?? ""} className="h-12 text-base" />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-base">End Meter</Label>
                <Input name="endHourMeter" type="number" step="0.1" min="0" defaultValue={log.endHourMeter ?? ""} className="h-12 text-base" />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label className="text-base">Start Time</Label>
                  <Input name="startTime" type="time" defaultValue={log.startTime ?? ""} className="h-12 text-base" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-base">Stop Time</Label>
                  <Input name="stopTime" type="time" defaultValue={log.stopTime ?? ""} className="h-12 text-base" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-base">Break (Minutes)</Label>
                <Input name="breakMinutes" type="number" step="1" min="0" defaultValue={log.breakMinutes ?? 0} className="h-12 text-base" />
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label className="text-base">Operator Name (Optional)</Label>
            <Input name="operatorName" defaultValue={log.operatorName ?? ""} className="h-12 text-base" />
          </div>

          <AttachmentPicker name="attachment" label="Attachment / Tool Used (Optional)" defaultValue={log.attachment ?? undefined} />

          <div className="flex flex-col gap-2">
            <Label className="text-base">Diesel Taken (L) (Optional)</Label>
            <Input name="dieselLiters" type="number" step="0.1" min="0" defaultValue={log.dieselLiters ?? ""} className="h-12 text-base" />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-base">Note (Optional)</Label>
            <Input name="notes" defaultValue={log.notes ?? ""} className="h-12 text-base" />
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
