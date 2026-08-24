"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { IndianRupee } from "lucide-react";
import { addTransactionAction } from "../actions";
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
  const [state, formAction, isPending] = useActionState(addTransactionAction, undefined);
  const [open, setOpen] = useState(false);
  const wasPending = useRef(false);
  const today = new Date().toISOString().slice(0, 10);
  const [addingCustom, setAddingCustom] = useState(false);
  const [deductFromSalary, setDeductFromSalary] = useState(true);
  const defaultCategoryId = categories.find((c) => c.name === "Salary Advance")?.id ?? "";

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

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
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="operatorId" value={operatorId} />

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

          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={isPending}>
              {isPending ? "Saving..." : "Save Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
