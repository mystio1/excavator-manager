"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Loader2, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DeleteTransactionButton({ operatorId, transactionId }: { operatorId: string; transactionId: string }) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    try {
      await apiFetch(`/api/operators/${operatorId}/transactions/${transactionId}`, { method: "DELETE" });
      setOpen(false);
      await mutate((key) => typeof key === "string" && key.startsWith("/api/operators/detail"));
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
            aria-label="Delete transaction"
          />
        }
      >
        <Trash2 className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this transaction?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Deleting the entry will permanently remove it and update the salary calculation. This cannot be undone.
        </p>
        <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="h-11 w-full"
            disabled={pending}
            onClick={handleDelete}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Yes, Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
