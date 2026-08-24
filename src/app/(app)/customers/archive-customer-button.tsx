"use client";

import { Trash2 } from "lucide-react";
import { archiveCustomerAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ArchiveCustomerButton({ id, name }: { id: string; name: string }) {
  return (
    <Dialog>
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
        <form action={archiveCustomerAction}>
          <input type="hidden" name="id" value={id} />
          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" variant="destructive" size="lg" className="h-11 w-full">
              Yes, Remove
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
