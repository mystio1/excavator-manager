"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Loader2, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ArchiveCustomerButton({ id, name }: { id: string; name: string }) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleArchive() {
    setPending(true);
    try {
      await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
      setOpen(false);
      await mutate((key) => typeof key === "string" && key.startsWith("/api/customers"));
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
            aria-label="Delete customer"
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <Trash2 className="size-4" />
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Remove {name}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This hides them from your customer list. Their past work and bills are kept for records.
        </p>
        <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
          <Button type="button" variant="destructive" size="lg" className="h-11 w-full" disabled={pending} onClick={handleArchive}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Yes, Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
