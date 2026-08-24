"use client";

import { useActionState } from "react";
import { addOperatorAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function AddOperatorForm() {
  const [state, formAction, isPending] = useActionState(addOperatorAction, undefined);

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name" className="text-base">
              Operator Name
            </Label>
            <Input id="name" name="name" required className="h-12 text-base" autoFocus />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mobile" className="text-base">
              Mobile Number
            </Label>
            <Input id="mobile" name="mobile" type="tel" required className="h-12 text-base" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="address" className="text-base">
              Address
            </Label>
            <Input id="address" name="address" className="h-12 text-base" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="joiningDate" className="text-base">
              Joining Date
            </Label>
            <Input id="joiningDate" name="joiningDate" type="date" className="h-12 text-base" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="defaultMonthlySalary" className="text-base">
              Monthly Salary
            </Label>
            <Input
              id="defaultMonthlySalary"
              name="defaultMonthlySalary"
              type="number"
              step="1"
              min="0"
              className="h-12 text-base"
            />
          </div>
          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
          <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending}>
            {isPending ? "Saving..." : "Save Operator"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
