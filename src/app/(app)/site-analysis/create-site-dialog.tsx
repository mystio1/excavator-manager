"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Plus } from "lucide-react";
import { apiFetch, swrFetcher } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type CustomerOptions = { customers: { id: string; name: string; companyName: string | null }[] };

/** Create Site: name, type, customer (customer sites only), location, status and optional starting rates. */
export function CreateSiteDialog({ onCreated }: { onCreated?: (siteId: string) => void }) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("CUSTOMER_SITE");
  const { data } = useSWR<CustomerOptions>(open ? "/api/customers/options" : null, swrFetcher);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    const res = await apiFetch<{ site: { id: string } }>("/api/sites", { method: "POST", body: JSON.stringify(body) });
    await mutate((key) => typeof key === "string" && key.startsWith("/api/sites"));
    onCreated?.(res.site.id);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const rate = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      return v === "" ? null : Number(v);
    };
    const ok = await run({
      name: fd.get("name"),
      type,
      customerId: type === "CUSTOMER_SITE" ? fd.get("customerId") || undefined : undefined,
      address: fd.get("address") || undefined,
      status: fd.get("status"),
      bucketRate: rate("bucketRate"),
      breakerRate: rate("breakerRate"),
    });
    if (ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" className="h-11" />}>
        <Plus className="size-4" />
        Create Site
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Site</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="site-name">Site Name</Label>
            <Input id="site-name" name="name" required maxLength={200} className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="site-type">Site Type</Label>
            <NativeSelect id="site-type" value={type} onChange={(e) => setType(e.target.value)} className="h-11">
              <option value="CUSTOMER_SITE">Customer Site</option>
              <option value="SELF_SITE">Self Site</option>
            </NativeSelect>
          </div>
          {type === "CUSTOMER_SITE" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="site-customer">Customer</Label>
              <NativeSelect id="site-customer" name="customerId" required defaultValue="" className="h-11">
                <option value="" disabled>
                  Select customer
                </option>
                {(data?.customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.companyName ? ` — ${c.companyName}` : ""}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="site-address">Location</Label>
            <Input id="site-address" name="address" maxLength={500} className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="site-status">Status</Label>
            <NativeSelect id="site-status" name="status" defaultValue="ACTIVE" className="h-11">
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="ON_HOLD">On Hold</option>
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="site-bucket">Bucket Rate (₹/hour)</Label>
              <Input id="site-bucket" name="bucketRate" type="number" min="0" step="0.01" inputMode="decimal" className="h-11" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="site-breaker">Brekar Rate (₹/hour)</Label>
              <Input id="site-breaker" name="breakerRate" type="number" min="0" step="0.01" inputMode="decimal" className="h-11" />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="h-11" disabled={pending}>
            {pending ? "Creating..." : "Create Site"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
