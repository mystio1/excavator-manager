"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ArchiveButton } from "@/components/archive-button";

type Customer = {
  id: string;
  /** Concurrency token: sent back as `expectedVersion` so an edit made on a stale copy is refused. */
  version: number;
  name: string;
  mobile: string;
  companyName: string | null;
  address: string | null;
  gstNumber: string | null;
};

export function EditCustomerForm({ customer, onReload }: { customer: Customer; onReload: () => void }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  // True when the server refused the save because someone else changed this
  // customer after it was loaded (RESOURCE_MODIFIED) — offers a reload.
  const [conflict, setConflict] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    setConflict(false);
    try {
      await apiFetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...body, expectedVersion: customer.version }),
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "RESOURCE_MODIFIED") setConflict(true);
      throw err;
    }
    await mutate((key) => typeof key === "string" && key.startsWith("/api/customers"));
  });
  const { error: archiveError, run: runArchive } = useApiForm(async () => {
    await apiFetch(`/api/customers/${customer.id}`, { method: "DELETE" });
    await mutate((key) => typeof key === "string" && key.startsWith("/api/customers"));
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      name: fd.get("name"),
      mobile: fd.get("mobile"),
      companyName: fd.get("companyName"),
      address: fd.get("address"),
      gstNumber: fd.get("gstNumber"),
    });
    if (ok) router.push(`/customers/detail?id=${customer.id}`);
  }

  async function handleArchive() {
    const ok = await runArchive(undefined);
    if (ok) router.push("/customers");
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
            {conflict && (
              <Button type="button" variant="secondary" size="lg" className="h-11" onClick={onReload}>
                Reload latest details
              </Button>
            )}
            <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ArchiveButton onArchive={handleArchive} itemName={customer.name} />
      {archiveError && <p role="alert" className="text-sm font-medium text-destructive">{archiveError}</p>}
    </div>
  );
}
