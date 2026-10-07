"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Loader2, Trash2 } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DeleteReadingButton({
  logId,
  version,
  invalidateKey,
}: {
  logId: string;
  /** The reading's version as loaded: a change made meanwhile is a conflict, not a silent delete. */
  version?: number;
  invalidateKey: string;
}) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const query = version !== undefined ? `?expectedVersion=${version}` : "";
      await apiFetch(`/api/daily-logs/${logId}${query}`, { method: "DELETE" });
      setOpen(false);
      await mutate(invalidateKey);
      await mutate((key) => typeof key === "string" && key.startsWith("/api/excavators"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
      // A conflict means what is on screen is stale — show the latest behind the message.
      if (e instanceof ApiError && e.code === "RESOURCE_MODIFIED") await mutate(invalidateKey);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setError(null);
        setOpen(next);
      }}
    >
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
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
          <Button type="button" variant="destructive" size="lg" className="h-11 w-full" disabled={pending} onClick={handleDelete}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Yes, Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
