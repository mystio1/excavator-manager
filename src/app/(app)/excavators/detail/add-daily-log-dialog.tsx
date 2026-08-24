"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Clock } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AddDailyLogDialog({
  excavatorId,
  workSessionId,
  currentHourMeter,
}: {
  excavatorId: string;
  workSessionId: string;
  currentHourMeter: number;
}) {
  const { mutate } = useSWRConfig();
  const [mode, setMode] = useState<"meter" | "time">("meter");
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch(`/api/excavators/${excavatorId}/daily-logs`, { method: "POST", body: JSON.stringify(body) });
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      workSessionId,
      date: fd.get("date"),
      startHourMeter: fd.get("startHourMeter") || undefined,
      endHourMeter: fd.get("endHourMeter") || undefined,
      startTime: fd.get("startTime") || undefined,
      stopTime: fd.get("stopTime") || undefined,
      breakMinutes: fd.get("breakMinutes") || undefined,
      operatorName: fd.get("operatorName") || undefined,
    });
    if (ok) {
      await mutate(`/api/excavators/${excavatorId}`);
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" variant="secondary" className="h-12 flex-1 text-base" />}>
        <Clock className="size-5" />
        Add Today&rsquo;s Work
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Today&rsquo;s Work</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="date" className="text-base">
              Date
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
              Hour Meter
            </button>
            <button
              type="button"
              onClick={() => setMode("time")}
              className={cn(
                "flex-1 rounded-md py-2 text-sm font-semibold",
                mode === "time" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              Start / Stop Time
            </button>
          </div>

          {mode === "meter" ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="startHourMeter" className="text-base">
                  Start Meter
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
                  End Meter
                </Label>
                <Input id="endHourMeter" name="endHourMeter" type="number" step="0.1" min="0" className="h-12 text-base" />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="startTime" className="text-base">
                    Start Time
                  </Label>
                  <Input id="startTime" name="startTime" type="time" className="h-12 text-base" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="stopTime" className="text-base">
                    Stop Time
                  </Label>
                  <Input id="stopTime" name="stopTime" type="time" className="h-12 text-base" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="breakMinutes" className="text-base">
                  Break (Minutes)
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="operatorName" className="text-base">
              Operator Name (Optional)
            </Label>
            <Input
              id="operatorName"
              name="operatorName"
              placeholder="Who ran the machine today"
              className="h-12 text-base"
            />
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
