"use client";

import { useActionState } from "react";
import { editOperatorAction, archiveOperatorAction } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ArchiveButton } from "@/components/archive-button";

type Operator = {
  id: string;
  name: string;
  mobile: string;
  address: string | null;
  joiningDate: Date | null;
  defaultMonthlySalary: number;
};

export function EditOperatorForm({ operator }: { operator: Operator }) {
  const [state, formAction, isPending] = useActionState(editOperatorAction, undefined);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={operator.id} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="name" className="text-base">
                Operator Name
              </Label>
              <Input id="name" name="name" defaultValue={operator.name} required className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mobile" className="text-base">
                Mobile Number
              </Label>
              <Input id="mobile" name="mobile" type="tel" defaultValue={operator.mobile} required className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="address" className="text-base">
                Address
              </Label>
              <Input id="address" name="address" defaultValue={operator.address ?? ""} className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="joiningDate" className="text-base">
                Joining Date
              </Label>
              <Input
                id="joiningDate"
                name="joiningDate"
                type="date"
                defaultValue={operator.joiningDate ? operator.joiningDate.toISOString().slice(0, 10) : ""}
                className="h-12 text-base"
              />
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
                defaultValue={operator.defaultMonthlySalary}
                className="h-12 text-base"
              />
            </div>
            {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
            <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ArchiveButton action={archiveOperatorAction} id={operator.id} itemName={operator.name} />
    </div>
  );
}
