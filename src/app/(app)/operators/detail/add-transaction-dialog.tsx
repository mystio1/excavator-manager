"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { IndianRupee } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TransactionFormFields } from "./transaction-form-fields";

export function AddTransactionDialog({
  operatorId,
  categories,
}: {
  operatorId: string;
  categories: { id: string; name: string }[];
}) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const defaultCategoryId = categories.find((c) => c.name === "Salary Advance")?.id ?? "";

  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch(`/api/operators/${operatorId}/transactions`, { method: "POST", body: JSON.stringify(body) });
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      categoryId: fd.get("categoryId") || undefined,
      newCategoryName: fd.get("newCategoryName") || undefined,
      amount: Number(fd.get("amount")),
      date: fd.get("date"),
      notes: fd.get("notes") || undefined,
      deductFromSalary: fd.get("deductFromSalary") === "on",
      businessEffect: fd.get("businessEffect"),
    });
    if (ok) {
      await mutate((key) => typeof key === "string" && key.startsWith("/api/operators/detail"));
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" className="h-11" />}>
        <IndianRupee className="size-4" />
        Add Money Transaction
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Money Transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <TransactionFormFields categories={categories} defaultCategoryId={defaultCategoryId} defaultDate={today} />

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
              {pending ? "Saving..." : "Save Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
