"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { rejectWorkRequestAction } from "../../operators/actions";
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
  const [state, formAction, isPending] = useActionState(rejectWorkRequestAction, undefined);
  const [open, setOpen] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

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
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="requestId" value={requestId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`note-${requestId}`} className="text-base">
              Note for the operator (optional)
            </Label>
            <Textarea id={`note-${requestId}`} name="note" placeholder="e.g. Please recheck the ending reading" className="min-h-20" />
          </div>

          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" variant="destructive" className="h-12 w-full text-base" disabled={isPending}>
              {isPending ? "Rejecting..." : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
