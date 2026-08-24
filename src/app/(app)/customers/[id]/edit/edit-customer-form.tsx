"use client";

import { useActionState } from "react";
import { editCustomerAction, archiveCustomerAction } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ArchiveButton } from "@/components/archive-button";

type Customer = {
  id: string;
  name: string;
  mobile: string;
  companyName: string | null;
  address: string | null;
  gstNumber: string | null;
};

export function EditCustomerForm({ customer }: { customer: Customer }) {
  const [state, formAction, isPending] = useActionState(editCustomerAction, undefined);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={customer.id} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="name" className="text-base">
                Customer Name
              </Label>
              <Input id="name" name="name" defaultValue={customer.name} required className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mobile" className="text-base">
                Mobile Number
              </Label>
              <Input id="mobile" name="mobile" type="tel" defaultValue={customer.mobile} required className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="companyName" className="text-base">
                Company Name
              </Label>
              <Input id="companyName" name="companyName" defaultValue={customer.companyName ?? ""} className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="address" className="text-base">
                Address
              </Label>
              <Input id="address" name="address" defaultValue={customer.address ?? ""} className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="gstNumber" className="text-base">
                GST Number (if applicable)
              </Label>
              <Input id="gstNumber" name="gstNumber" defaultValue={customer.gstNumber ?? ""} className="h-12 text-base" />
            </div>
            {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
            <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ArchiveButton action={archiveCustomerAction} id={customer.id} itemName={customer.name} />
    </div>
  );
}
