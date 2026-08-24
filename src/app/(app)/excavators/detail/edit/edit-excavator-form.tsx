"use client";

import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
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
  const router = useRouter();
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch(`/api/excavators/${excavator.id}`, { method: "PATCH", body: JSON.stringify(body) });
  });
  const { run: runArchive } = useApiForm(async () => {
    await apiFetch(`/api/excavators/${excavator.id}`, { method: "DELETE" });
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      name: fd.get("name"),
      machineNumber: fd.get("machineNumber"),
      brand: fd.get("brand"),
      model: fd.get("model"),
      purchaseDate: fd.get("purchaseDate"),
      serviceIntervalHrs: fd.get("serviceIntervalHrs") || undefined,
    });
    if (ok) router.push(`/excavators/detail?id=${excavator.id}`);
  }

  async function handleArchive() {
    const ok = await runArchive(undefined);
    if (ok) router.push("/excavators");
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
                defaultValue={excavator.purchaseDate ? new Date(excavator.purchaseDate).toISOString().slice(0, 10) : ""}
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
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ArchiveButton onArchive={handleArchive} itemName={excavator.name} />
    </div>
  );
}
