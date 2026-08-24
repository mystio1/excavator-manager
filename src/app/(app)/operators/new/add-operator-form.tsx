"use client";

import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function AddOperatorForm() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    const { operator } = await apiFetch<{ operator: { id: string } }>("/api/operators", {
      method: "POST",
      body: JSON.stringify(body),
    });
    await mutate("/api/operators");
    router.push(`/operators/detail?id=${operator.id}`);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await run({
      name: fd.get("name"),
      mobile: fd.get("mobile"),
      address: fd.get("address"),
      joiningDate: fd.get("joiningDate"),
      defaultMonthlySalary: fd.get("defaultMonthlySalary") || undefined,
    });
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
            {pending ? "Saving..." : "Save Operator"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
