"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function RejectWorkRequestDialog({ requestId }: { requestId: string }) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const { error, pending, run } = useApiForm(async (note: string | undefined) => {
    await apiFetch(`/api/work-requests/${requestId}/reject`, { method: "POST", body: JSON.stringify({ note }) });
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const note = new FormData(e.currentTarget).get("note") as string;
    const ok = await run(note || undefined);
    if (ok) {
      await mutate((key) => typeof key === "string" && key.startsWith("/api/excavators"));
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" />}>
        <X className="size-4" />
        Reject
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Job</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`note-${requestId}`} className="text-base">
              Note for the operator (optional)
            </Label>
            <Textarea id={`note-${requestId}`} name="note" placeholder="e.g. Please recheck the ending reading" className="min-h-20" />
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" variant="destructive" className="h-12 w-full text-base" disabled={pending}>
              {pending ? "Rejecting..." : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
