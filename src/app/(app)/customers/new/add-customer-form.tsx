"use client";

import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function AddCustomerForm() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    const { customer } = await apiFetch<{ customer: { id: string } }>("/api/customers", {
      method: "POST",
      body: JSON.stringify(body),
    });
    await mutate((key) => typeof key === "string" && key.startsWith("/api/customers"));
    router.push(`/customers/detail?id=${customer.id}`);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await run({
      name: fd.get("name"),
      mobile: fd.get("mobile"),
      companyName: fd.get("companyName"),
      address: fd.get("address"),
      gstNumber: fd.get("gstNumber"),
    });
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
            {pending ? "Saving..." : "Save Customer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
