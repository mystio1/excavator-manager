"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Square } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils/currency";
import { todayLocal } from "@/lib/utils/dates";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Closes the active session without starting a new one — the operator has stopped
 * working. Salary stops accruing on the end date; anything still owed stays on this
 * session until a new one is started and carries it forward. */
export function CloseSessionDialog({
  operatorId,
  periodId,
  sessionNumber,
  version,
  pending: owed,
}: {
  operatorId: string;
  periodId: string;
  sessionNumber: number;
  version: number;
  pending: number;
}) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch(`/api/operators/${operatorId}/periods/${periodId}`, { method: "PATCH", body: JSON.stringify(body) });
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({ close: true, endDate: fd.get("endDate"), expectedVersion: version });
    if (ok) {
      await mutate((key) => typeof key === "string" && key.startsWith("/api/operators/"));
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" variant="outline" className="h-11" />}>
        <Square className="size-4" />
        Close Session
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close Session #{sessionNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="endDate" className="text-base">
              Last Working Day
            </Label>
            <Input id="endDate" name="endDate" type="date" defaultValue={todayLocal()} required className="h-12 text-base" />
          </div>

          <p className="text-sm text-muted-foreground">
            Salary stops accruing after this date. You can still record payments during the holiday — they stay on this
            session until a new one is started.
          </p>

          {owed > 0 && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outstanding on this session</span>
                <span className="font-bold text-working">{formatCurrency(owed)}</span>
              </div>
            </div>
          )}

          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
              {pending ? "Closing..." : "Close Session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
