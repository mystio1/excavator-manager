"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { IndianRupee } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { BUSINESS_EFFECTS, BUSINESS_EFFECT_LABEL } from "@/lib/validation/operatorTransaction";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  const [addingCustom, setAddingCustom] = useState(false);
  const [deductFromSalary, setDeductFromSalary] = useState(true);
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
          <div className="flex flex-col gap-2">
            <Label className="text-base">Category</Label>
            {!addingCustom ? (
              <>
                <NativeSelect name="categoryId" defaultValue={defaultCategoryId} className="h-12 text-base">
                  <option value="" disabled>
                    Select category
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
                <button
                  type="button"
                  onClick={() => setAddingCustom(true)}
                  className="self-start text-sm font-semibold text-primary"
                >
                  + Add Custom Category
                </button>
              </>
            ) : (
              <>
                <Input name="newCategoryName" placeholder="e.g. Mobile Repair" required className="h-12 text-base" />
                <button
                  type="button"
                  onClick={() => setAddingCustom(false)}
                  className="self-start text-sm font-semibold text-muted-foreground"
                >
                  Use existing category instead
                </button>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-base">Amount</Label>
              <Input name="amount" type="number" min="1" step="1" required className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-base">Date</Label>
              <Input name="date" type="date" defaultValue={today} required className="h-12 text-base" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-base">Notes (Optional)</Label>
            <Input name="notes" className="h-12 text-base" />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="deductFromSalary"
              checked={deductFromSalary}
              onChange={(e) => setDeductFromSalary(e.target.checked)}
              className="size-4"
            />
            Deduct this amount from salary?
          </label>

          <div className="flex flex-col gap-2">
            <Label className="text-base">How should this affect the business account?</Label>
            <NativeSelect name="businessEffect" defaultValue="ADVANCE_RECOVERABLE" className="h-12 text-base">
              {BUSINESS_EFFECTS.map((effect) => (
                <option key={effect} value={effect}>
                  {BUSINESS_EFFECT_LABEL[effect]}
                </option>
              ))}
            </NativeSelect>
          </div>

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
