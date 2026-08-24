"use client";

import { Trash2 } from "lucide-react";
import { archiveOperatorAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DeleteOperatorButton({ operatorId, operatorName }: { operatorId: string; operatorName: string }) {
  return (
    <Dialog>
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
        <form action={archiveOperatorAction}>
          <input type="hidden" name="id" value={operatorId} />
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
