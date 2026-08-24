"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DeleteExcavatorButton({ excavatorId, excavatorName }: { excavatorId: string; excavatorName: string }) {
  const router = useRouter();
  const { error, pending, run } = useApiForm(async () => {
    await apiFetch(`/api/excavators/${excavatorId}`, { method: "DELETE" });
  });

  async function handleDelete() {
    if (await run(undefined)) router.push("/excavators");
  }

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
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
          <Button type="button" variant="destructive" size="lg" className="h-11 w-full" disabled={pending} onClick={handleDelete}>
            {pending ? "Deleting..." : "Yes, Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
