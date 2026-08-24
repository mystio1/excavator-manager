"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
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
  const { mutate } = useSWRConfig();
  const [success, setSuccess] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch("/api/settings/profile", { method: "PATCH", body: JSON.stringify(body) });
    await mutate("/api/settings");
    setSuccess(true);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSuccess(false);
    const fd = new FormData(e.currentTarget);
    await run({
      name: fd.get("name"),
      ownerName: fd.get("ownerName"),
      phone: fd.get("phone"),
      address: fd.get("address"),
      gstNumber: fd.get("gstNumber"),
      defaultServiceIntervalHrs: Number(fd.get("defaultServiceIntervalHrs")),
      maintenanceAlertThresholdHrs: Number(fd.get("maintenanceAlertThresholdHrs")),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Business Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          {success && !error && <p className="text-sm font-medium text-working">Saved.</p>}
          <Button type="submit" size="lg" className="h-11 self-start" disabled={pending}>
            {pending ? "Saving..." : "Save Business Profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
