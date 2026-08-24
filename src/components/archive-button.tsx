"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ArchiveButton({
  onArchive,
  itemName,
}: {
  onArchive: () => Promise<void>;
  itemName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleArchive() {
    setPending(true);
    try {
      await onArchive();
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="destructive" size="lg" className="h-11" />}
      >
        <Trash2 className="size-5" />
        Archive
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive {itemName}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This removes it from your active lists. All history stays safe and can be restored later if needed.
        </p>
        <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
          <Button type="button" variant="destructive" size="lg" className="h-11 w-full" disabled={pending} onClick={handleArchive}>
            {pending ? "Archiving..." : "Yes, Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
