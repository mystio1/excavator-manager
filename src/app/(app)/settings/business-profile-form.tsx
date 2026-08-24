"use client";

import { useActionState } from "react";
import { updateBusinessProfileAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function BusinessProfileForm({
  business,
}: {
  business: {
    name: string;
    ownerName: string;
    phone: string;
    address: string | null;
    gstNumber: string | null;
    defaultServiceIntervalHrs: number;
    maintenanceAlertThresholdHrs: number;
  };
}) {
  const [state, formAction, isPending] = useActionState(updateBusinessProfileAction, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Business Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name" className="text-base">
                Business Name
              </Label>
              <Input key={business.name} id="name" name="name" defaultValue={business.name} required className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ownerName" className="text-base">
                Owner Name
              </Label>
              <Input key={business.ownerName} id="ownerName" name="ownerName" defaultValue={business.ownerName} required className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone" className="text-base">
                Phone
              </Label>
              <Input key={business.phone} id="phone" name="phone" defaultValue={business.phone} required className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="gstNumber" className="text-base">
                GST Number
              </Label>
              <Input key={business.gstNumber} id="gstNumber" name="gstNumber" defaultValue={business.gstNumber ?? ""} className="h-12 text-base" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="address" className="text-base">
              Address
            </Label>
            <Input key={business.address} id="address" name="address" defaultValue={business.address ?? ""} className="h-12 text-base" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="defaultServiceIntervalHrs" className="text-base">
                Default Service Interval (Hours)
              </Label>
              <Input
                key={business.defaultServiceIntervalHrs}
                id="defaultServiceIntervalHrs"
                name="defaultServiceIntervalHrs"
                type="number"
                min="1"
                defaultValue={business.defaultServiceIntervalHrs}
                required
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="maintenanceAlertThresholdHrs" className="text-base">
                Alert When Due Within (Hours)
              </Label>
              <Input
                key={business.maintenanceAlertThresholdHrs}
                id="maintenanceAlertThresholdHrs"
                name="maintenanceAlertThresholdHrs"
                type="number"
                min="1"
                defaultValue={business.maintenanceAlertThresholdHrs}
                required
                className="h-12 text-base"
              />
            </div>
          </div>
          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
          {state?.success && <p className="text-sm font-medium text-working">Saved.</p>}
          <Button type="submit" size="lg" className="h-11 self-start" disabled={isPending}>
            {isPending ? "Saving..." : "Save Business Profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
