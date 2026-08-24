"use client";

import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
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
  const router = useRouter();
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch(`/api/operators/${operator.id}`, { method: "PATCH", body: JSON.stringify(body) });
  });
  const { run: runArchive } = useApiForm(async () => {
    await apiFetch(`/api/operators/${operator.id}`, { method: "DELETE" });
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      name: fd.get("name"),
      mobile: fd.get("mobile"),
      address: fd.get("address"),
      joiningDate: fd.get("joiningDate"),
      defaultMonthlySalary: fd.get("defaultMonthlySalary") || undefined,
    });
    if (ok) router.push(`/operators/detail?id=${operator.id}`);
  }

  async function handleArchive() {
    const ok = await runArchive(undefined);
    if (ok) router.push("/operators");
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
                defaultValue={operator.joiningDate ? new Date(operator.joiningDate).toISOString().slice(0, 10) : ""}
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
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ArchiveButton onArchive={handleArchive} itemName={operator.name} />
    </div>
  );
}
