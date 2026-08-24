"use client";

import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function AddExcavatorForm({ defaultServiceIntervalHrs }: { defaultServiceIntervalHrs: number }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    const { excavator } = await apiFetch<{ excavator: { id: string } }>("/api/excavators", {
      method: "POST",
      body: JSON.stringify(body),
    });
    await mutate("/api/excavators");
    router.push(`/excavators/detail?id=${excavator.id}`);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await run({
      name: fd.get("name"),
      machineNumber: fd.get("machineNumber"),
      brand: fd.get("brand"),
      model: fd.get("model"),
      purchaseDate: fd.get("purchaseDate"),
      startingHourMeter: Number(fd.get("startingHourMeter")),
      serviceIntervalHrs: fd.get("serviceIntervalHrs") || undefined,
    });
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name" className="text-base">
              Machine Name
            </Label>
            <Input id="name" name="name" placeholder="e.g. JCB-01" required className="h-12 text-base" autoFocus />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="machineNumber" className="text-base">
              Machine / Registration Number (Optional)
            </Label>
            <Input id="machineNumber" name="machineNumber" className="h-12 text-base" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="brand" className="text-base">
                Brand
              </Label>
              <Input id="brand" name="brand" placeholder="Tata Hitachi" className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="model" className="text-base">
                Model
              </Label>
              <Input id="model" name="model" className="h-12 text-base" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="purchaseDate" className="text-base">
              Purchase Date
            </Label>
            <Input id="purchaseDate" name="purchaseDate" type="date" className="h-12 text-base" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="startingHourMeter" className="text-base">
              Starting Hour Meter
            </Label>
            <Input
              id="startingHourMeter"
              name="startingHourMeter"
              type="number"
              step="0.1"
              min="0"
              defaultValue={0}
              required
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
              placeholder={String(defaultServiceIntervalHrs)}
              className="h-12 text-base"
            />
            <p className="text-sm text-muted-foreground">
              Leave blank to use your default of every {defaultServiceIntervalHrs} hours.
            </p>
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
            {pending ? "Saving..." : "Save Machine"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
