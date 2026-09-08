"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Square } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
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
  const { mutate } = useSWRConfig();
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch(`/api/excavators/${excavatorId}/stop-work`, { method: "POST", body: JSON.stringify(body) });
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      workSessionId,
      endDate: fd.get("endDate"),
      endHourMeter: Number(fd.get("endHourMeter")),
      dieselLiters: fd.get("dieselLiters") || undefined,
      notes: fd.get("notes") || undefined,
    });
    if (ok) {
      await mutate(`/api/excavators/${excavatorId}`);
      setOpen(false);
    }
  }

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
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="dieselLiters" className="text-base">
              Diesel Taken (L) (Optional)
            </Label>
            <Input id="dieselLiters" name="dieselLiters" type="number" step="0.1" min="0" className="h-12 text-base" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="stopWorkNotes" className="text-base">
              Note (Optional)
            </Label>
            <Input id="stopWorkNotes" name="notes" className="h-12 text-base" />
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
              {pending ? "Stopping..." : "Confirm Stop Work"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
