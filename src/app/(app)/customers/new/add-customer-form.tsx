"use client";

import { useActionState } from "react";
import { addCustomerAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function AddCustomerForm() {
  const [state, formAction, isPending] = useActionState(addCustomerAction, undefined);

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name" className="text-base">
              Customer Name
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
            <Label htmlFor="companyName" className="text-base">
              Company Name
            </Label>
            <Input id="companyName" name="companyName" className="h-12 text-base" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="address" className="text-base">
              Address
            </Label>
            <Input id="address" name="address" className="h-12 text-base" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="gstNumber" className="text-base">
              GST Number (if applicable)
            </Label>
            <Input id="gstNumber" name="gstNumber" className="h-12 text-base" />
          </div>
          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
          <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending}>
            {isPending ? "Saving..." : "Save Customer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
