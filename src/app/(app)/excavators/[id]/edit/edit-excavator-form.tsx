"use client";

import { useActionState } from "react";
import { editExcavatorAction, archiveExcavatorAction } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ArchiveButton } from "@/components/archive-button";

type Excavator = {
  id: string;
  name: string;
  machineNumber: string | null;
  brand: string | null;
  model: string | null;
  purchaseDate: Date | null;
  serviceIntervalHrs: number | null;
};

export function EditExcavatorForm({
  excavator,
  defaultServiceIntervalHrs,
}: {
  excavator: Excavator;
  defaultServiceIntervalHrs: number;
}) {
  const [state, formAction, isPending] = useActionState(editExcavatorAction, undefined);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={excavator.id} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="name" className="text-base">
                Machine Name
              </Label>
              <Input id="name" name="name" defaultValue={excavator.name} required className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="machineNumber" className="text-base">
                Machine / Registration Number (Optional)
              </Label>
              <Input
                id="machineNumber"
                name="machineNumber"
                defaultValue={excavator.machineNumber ?? ""}
                className="h-12 text-base"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="brand" className="text-base">
                  Brand
                </Label>
                <Input id="brand" name="brand" defaultValue={excavator.brand ?? ""} className="h-12 text-base" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="model" className="text-base">
                  Model
                </Label>
                <Input id="model" name="model" defaultValue={excavator.model ?? ""} className="h-12 text-base" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="purchaseDate" className="text-base">
                Purchase Date
              </Label>
              <Input
                id="purchaseDate"
                name="purchaseDate"
                type="date"
                defaultValue={excavator.purchaseDate ? excavator.purchaseDate.toISOString().slice(0, 10) : ""}
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="serviceIntervalHrs" className="text-base">
                Service Every (Hours)
              </Label>
              <Input
                id="serviceIntervalHrs"
                name="serviceIntervalHrs"
                type="number"
                step="1"
                min="1"
                defaultValue={excavator.serviceIntervalHrs ?? ""}
                placeholder={String(defaultServiceIntervalHrs)}
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

      <ArchiveButton action={archiveExcavatorAction} id={excavator.id} itemName={excavator.name} />
    </div>
  );
}
