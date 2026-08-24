"use client";

import { Trash2 } from "lucide-react";
import { archiveExcavatorAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DeleteExcavatorButton({ excavatorId, excavatorName }: { excavatorId: string; excavatorName: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="lg" className="h-11" variant="destructive" />}>
        <Trash2 className="size-4" />
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {excavatorName}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Deleting the machine will permanently remove it from your active machine list. Its work history, service
          records and past bills stay on record. This cannot be undone.
        </p>
        <form action={archiveExcavatorAction}>
          <input type="hidden" name="id" value={excavatorId} />
          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" variant="destructive" size="lg" className="h-11 w-full">
              Yes, Delete
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
