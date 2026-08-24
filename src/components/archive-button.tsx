"use client";

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
  action,
  id,
  itemName,
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  itemName: string;
}) {
  return (
    <Dialog>
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
          <form action={action} className="w-full">
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="destructive" size="lg" className="h-11 w-full">
              Yes, Archive
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
