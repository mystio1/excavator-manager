"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Play, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { AttachmentPicker } from "@/components/attachment-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type CustomerOption = { id: string; name: string; companyName: string | null };

export function StartWorkDialog({
  excavatorId,
  currentHourMeter,
  currentOperatorName,
  defaultSiteName,
  customers: initialCustomers,
}: {
  excavatorId: string;
  currentHourMeter: number;
  currentOperatorName: string | null;
  defaultSiteName: string | null;
  customers: CustomerOption[];
}) {
  const { mutate } = useSWRConfig();
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);

  const [customers, setCustomers] = useState<CustomerOption[]>(initialCustomers);
  const [customerId, setCustomerId] = useState("");

  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch(`/api/excavators/${excavatorId}/start-work`, { method: "POST", body: JSON.stringify(body) });
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      customerId: fd.get("customerId"),
      siteName: fd.get("siteName"),
      startDate: fd.get("startDate"),
      startHourMeter: Number(fd.get("startHourMeter")),
      attachment: fd.get("attachment") || undefined,
    });
    if (ok) {
      await mutate(`/api/excavators/${excavatorId}`);
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" className="h-12 flex-1 text-base" />}>
        <Play className="size-5" />
        Start New Work
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start New Work</DialogTitle>
        </DialogHeader>
        {!currentOperatorName ? (
          <p className="text-sm text-muted-foreground">
            No operator is assigned to this machine yet. Assign one from the card above before starting work.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <form id="start-work-form" onSubmit={onSubmit} className="contents">
              <div className="rounded-lg border border-dashed p-3 text-sm">
                <span className="text-muted-foreground">Operator: </span>
                <span className="font-semibold">{currentOperatorName}</span>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="customerId" className="text-base">
                  Customer
                </Label>
                {customers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add a customer below to get started.</p>
                ) : (
                  <NativeSelect
                    id="customerId"
                    name="customerId"
                    required
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="" disabled>
                      Select customer
                    </option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.companyName ? ` (${c.companyName})` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="siteName" className="text-base">
                  Site
                </Label>
                <Input
                  key={defaultSiteName ?? ""}
                  id="siteName"
                  name="siteName"
                  placeholder="e.g. Wagholi"
                  defaultValue={defaultSiteName ?? ""}
                  required
                  className="h-12 text-base"
                />
                {defaultSiteName && (
                  <p className="text-xs text-muted-foreground">
                    Filled in from this machine&rsquo;s last known location — change it if that&rsquo;s not right
                    today.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="startDate" className="text-base">
                  Start Date
                </Label>
                <Input id="startDate" name="startDate" type="date" defaultValue={today} required className="h-12 text-base" />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="startHourMeter" className="text-base">
                  Starting Hour Meter
                </Label>
                <Input
                  id="startHourMeter"
                  name="startHourMeter"
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={currentHourMeter}
                  required
                  className="h-12 text-base"
                />
              </div>

              <AttachmentPicker name="attachment" label="Tool Used (Optional)" />
            </form>

            <AddCustomerInline
              onAdded={(customer) => {
                setCustomers((prev) => [...prev, customer]);
                setCustomerId(customer.id);
              }}
            />

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}

            <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
              <Button
                type="submit"
                form="start-work-form"
                size="lg"
                className="h-12 w-full text-base"
                disabled={pending || customers.length === 0}
              >
                {pending ? "Starting..." : "Start Work"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddCustomerInline({ onAdded }: { onAdded: (customer: CustomerOption) => void }) {
  const { mutate } = useSWRConfig();
  const [show, setShow] = useState(false);
  const { error, pending, run } = useApiForm(async (body: { name: string; mobile: string }) => {
    const { customer } = await apiFetch<{ customer: CustomerOption }>("/api/customers", {
      method: "POST",
      body: JSON.stringify(body),
    });
    onAdded(customer);
    setShow(false);
    await mutate((key) => typeof key === "string" && key.startsWith("/api/customers"));
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await run({ name: fd.get("name") as string, mobile: fd.get("mobile") as string });
  }

  if (!show) {
    return (
      <button
        type="button"
        onClick={() => setShow(true)}
        className="flex items-center gap-1.5 self-start text-sm font-semibold text-primary"
      >
        <Plus className="size-4" />
        Add New Customer
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Input name="name" placeholder="Customer name" className="h-10 text-sm" />
          <Input name="mobile" placeholder="Mobile number" className="h-10 text-sm" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {pending ? "Adding..." : "Add"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShow(false)}>
            Cancel
          </Button>
        </div>
      </form>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
