"use client";

import { Trash2 } from "lucide-react";
import { deleteDailyLogAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DeleteReadingButton({ logId, redirectTo }: { logId: string; redirectTo: string }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            aria-label="Delete reading"
          />
        }
      >
        <Trash2 className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this reading?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Deleting the entry will permanently delete it. This cannot be undone.
        </p>
        <form action={deleteDailyLogAction}>
          <input type="hidden" name="logId" value={logId} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
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
