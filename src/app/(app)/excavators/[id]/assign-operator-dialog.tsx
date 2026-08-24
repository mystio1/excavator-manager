"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { HardHat } from "lucide-react";
import { assignOperatorAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AssignOperatorDialog({
  excavatorId,
  operators,
  hasCurrentOperator,
}: {
  excavatorId: string;
  operators: { id: string; name: string }[];
  hasCurrentOperator: boolean;
}) {
  const [state, formAction, isPending] = useActionState(assignOperatorAction, undefined);
  const [open, setOpen] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="secondary" />}>
        <HardHat className="size-4" />
        {hasCurrentOperator ? "Change" : "Assign"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hasCurrentOperator ? "Change Operator" : "Assign Operator"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="excavatorId" value={excavatorId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="operatorId" className="text-base">
              Operator
            </Label>
            {operators.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add an operator first.</p>
            ) : (
              <NativeSelect id="operatorId" name="operatorId" required defaultValue="">
                <option value="" disabled>
                  Select operator
                </option>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>

          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={isPending || operators.length === 0}>
              {isPending ? "Saving..." : hasCurrentOperator ? "Change Operator" : "Assign Operator"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
