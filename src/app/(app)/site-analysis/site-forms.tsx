"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Pencil } from "lucide-react";
import { ApiError, apiFetch, swrFetcher } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils/currency";
import { todayLocal } from "@/lib/utils/dates";

const refreshSites = (key: unknown) => typeof key === "string" && key.startsWith("/api/sites");

/** Bucket / Brekar rate summary with the inline [Edit Rates] form. A change is effective-dated: earlier work and bills keep their old rates. */
export function RatesCard({
  siteId,
  version,
  bucketRate,
  breakerRate,
  onReload,
}: {
  siteId: string;
  version: number;
  bucketRate: number | null;
  breakerRate: number | null;
  onReload: () => void;
}) {
  const { mutate } = useSWRConfig();
  const [editing, setEditing] = useState(false);
  const [conflict, setConflict] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    setConflict(false);
    try {
      await apiFetch(`/api/sites/${siteId}/rates`, { method: "PATCH", body: JSON.stringify({ ...body, expectedVersion: version }) });
    } catch (err) {
      if (err instanceof ApiError && err.code === "RESOURCE_MODIFIED") setConflict(true);
      throw err;
    }
    await mutate(refreshSites);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const rate = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      return v === "" ? null : Number(v);
    };
    const ok = await run({ bucketRate: rate("bucketRate"), breakerRate: rate("breakerRate"), effectiveFrom: fd.get("effectiveFrom") });
    if (ok) setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">Bucket Rate</span>
          <span className="font-bold tabular-nums">{bucketRate != null ? `${formatCurrency(bucketRate)}/hour` : "Not set"}</span>
          <span className="text-muted-foreground">Brekar Rate</span>
          <span className="font-bold tabular-nums">{breakerRate != null ? `${formatCurrency(breakerRate)}/hour` : "Not set"}</span>
        </div>
        <Button type="button" variant="secondary" className="h-11" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
          Edit Rates
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate-bucket">Bucket Rate (₹/hour)</Label>
          <Input id="rate-bucket" name="bucketRate" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={bucketRate ?? ""} className="h-11" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate-breaker">Brekar / Breaker Rate (₹/hour)</Label>
          <Input id="rate-breaker" name="breakerRate" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={breakerRate ?? ""} className="h-11" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate-from">Effective from</Label>
          <Input id="rate-from" name="effectiveFrom" type="date" defaultValue={todayLocal()} required className="h-11" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Work done before this date keeps the old rate, and existing bills are not changed.
      </p>
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      {conflict && (
        <Button type="button" variant="secondary" className="h-11" onClick={onReload}>
          Reload latest details
        </Button>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="h-11" disabled={pending}>
          {pending ? "Saving..." : "Save Rates"}
        </Button>
        <Button type="button" variant="outline" size="lg" className="h-11" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type CustomerOptions = { customers: { id: string; name: string; companyName: string | null }[] };

/** Edit a site's basics: name, location, status, type and customer. */
export function EditSiteDialog({
  site,
  onReload,
}: {
  site: { id: string; version: number; name: string; location: string | null; status: string; type: string; customerId: string | null };
  onReload: () => void;
}) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(site.type);
  const [conflict, setConflict] = useState(false);
  const { data } = useSWR<CustomerOptions>(open ? "/api/customers/options" : null, swrFetcher);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    setConflict(false);
    try {
      await apiFetch(`/api/sites/${site.id}`, { method: "PATCH", body: JSON.stringify({ ...body, expectedVersion: site.version }) });
    } catch (err) {
      if (err instanceof ApiError && err.code === "RESOURCE_MODIFIED") setConflict(true);
      throw err;
    }
    await mutate(refreshSites);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      name: fd.get("name"),
      type,
      customerId: type === "CUSTOMER_SITE" ? fd.get("customerId") || null : null,
      address: fd.get("address") || null,
      status: fd.get("status"),
    });
    if (ok) setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setType(site.type);
      }}
    >
      <DialogTrigger render={<Button size="lg" variant="secondary" className="h-11" />}>
        <Pencil className="size-4" />
        Edit Site
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Site</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-site-name">Site Name</Label>
            <Input id="edit-site-name" name="name" defaultValue={site.name} required maxLength={200} className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-site-type">Site Type</Label>
            <NativeSelect id="edit-site-type" value={type} onChange={(e) => setType(e.target.value)} className="h-11">
              <option value="CUSTOMER_SITE">Customer Site</option>
              <option value="SELF_SITE">Self Site</option>
            </NativeSelect>
          </div>
          {type === "CUSTOMER_SITE" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-site-customer">Customer</Label>
              <NativeSelect id="edit-site-customer" name="customerId" defaultValue={site.customerId ?? ""} required className="h-11">
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
            <Label htmlFor="edit-site-address">Location</Label>
            <Input id="edit-site-address" name="address" defaultValue={site.location ?? ""} maxLength={500} className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-site-status">Status</Label>
            <NativeSelect id="edit-site-status" name="status" defaultValue={site.status} className="h-11">
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="ON_HOLD">On Hold</option>
            </NativeSelect>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          {conflict && (
            <Button type="button" variant="secondary" className="h-11" onClick={onReload}>
              Reload latest details
            </Button>
          )}
          <Button type="submit" size="lg" className="h-11" disabled={pending}>
            {pending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
