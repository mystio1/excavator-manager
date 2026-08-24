"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Loader2, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DeleteOperatorButton({ operatorId, operatorName }: { operatorId: string; operatorName: string }) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    try {
      await apiFetch(`/api/operators/${operatorId}`, { method: "DELETE" });
      setOpen(false);
      // Re-fetches the list this button lives on (SWR's cache key is the
      // request path) — the client-fetch analogue of the old
      // revalidatePath("/operators") in the Server Action this replaced.
      await mutate("/api/operators");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${operatorName}`}
          />
        }
      >
        <Trash2 className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {operatorName}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Deleting the operator will permanently remove them, along with their data, from your active operator
          list. This cannot be undone.
        </p>
        <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
          <Button type="button" variant="destructive" size="lg" className="h-11 w-full" disabled={pending} onClick={handleDelete}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Yes, Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
