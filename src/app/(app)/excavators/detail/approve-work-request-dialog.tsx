"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Check } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ApproveWorkRequestDialog({
  requestId,
  operatorName,
  startHourMeter,
  endHourMeter,
  attachment,
  siteName,
  dieselLiters,
  dieselDate,
  notes,
  customers,
}: {
  requestId: string;
  operatorName: string;
  startHourMeter: number;
  endHourMeter: number;
  attachment: string | null;
  siteName: string | null;
  dieselLiters: number | null;
  dieselDate: Date | null;
  notes: string | null;
  customers: { id: string; name: string; companyName: string | null }[];
}) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(customers.length === 0);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch(`/api/work-requests/${requestId}/approve`, { method: "POST", body: JSON.stringify(body) });
  });

  const dieselDateValue = dieselDate ? new Date(dieselDate).toISOString().slice(0, 10) : "";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      customerId: fd.get("customerId") || undefined,
      newCustomerName: fd.get("newCustomerName") || undefined,
      newCustomerMobile: fd.get("newCustomerMobile") || undefined,
      siteName: fd.get("siteName"),
      startHourMeter: Number(fd.get("startHourMeter")),
      endHourMeter: Number(fd.get("endHourMeter")),
      attachment: fd.get("attachment") || undefined,
      dieselLiters: fd.get("dieselLiters") || undefined,
      dieselDate: fd.get("dieselDate") || undefined,
      notes: fd.get("notes") || undefined,
    });
    if (ok) {
      await mutate((key) => typeof key === "string" && key.startsWith("/api/excavators"));
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="bg-working text-working-foreground hover:bg-working/90" />}>
        <Check className="size-4" />
        Approve
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Approve Job</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="rounded-lg border border-dashed p-3 text-sm">
            <span className="text-muted-foreground">Operator: </span>
            <span className="font-semibold">{operatorName}</span>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-base">Customer</Label>
            {!addingCustomer ? (
              <>
                <NativeSelect name="customerId" defaultValue="" className="h-12 text-base">
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
                {customers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAddingCustomer(true)}
                    className="self-start text-sm font-semibold text-primary"
                  >
                    + Add New Customer
                  </button>
                )}
              </>
            ) : (
              <>
                <Input name="newCustomerName" placeholder="Customer name" required className="h-12 text-base" />
                <Input name="newCustomerMobile" placeholder="Mobile number (optional)" className="h-12 text-base" />
                {customers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAddingCustomer(false)}
                    className="self-start text-sm font-semibold text-muted-foreground"
                  >
                    Use existing customer instead
                  </button>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`approve-startHourMeter-${requestId}`} className="text-base">
                Starting Reading
              </Label>
              <Input
                key={startHourMeter}
                id={`approve-startHourMeter-${requestId}`}
                name="startHourMeter"
                type="number"
                step="0.1"
                min="0"
                defaultValue={startHourMeter}
                required
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`approve-endHourMeter-${requestId}`} className="text-base">
                Ending Reading
              </Label>
              <Input
                key={endHourMeter}
                id={`approve-endHourMeter-${requestId}`}
                name="endHourMeter"
                type="number"
                step="0.1"
                min="0"
                defaultValue={endHourMeter}
                required
                className="h-12 text-base"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`approve-siteName-${requestId}`} className="text-base">
              Site
            </Label>
            <Input
              key={siteName}
              id={`approve-siteName-${requestId}`}
              name="siteName"
              placeholder="e.g. Wagholi"
              defaultValue={siteName ?? ""}
              required
              className="h-12 text-base"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`approve-attachment-${requestId}`} className="text-base">
              Attachment / Tool Used
            </Label>
            <Input
              key={attachment}
              id={`approve-attachment-${requestId}`}
              name="attachment"
              placeholder="e.g. Bucket, Breaker"
              defaultValue={attachment ?? ""}
              className="h-12 text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`approve-dieselLiters-${requestId}`} className="text-base">
                Diesel Received (L)
              </Label>
              <Input
                key={dieselLiters}
                id={`approve-dieselLiters-${requestId}`}
                name="dieselLiters"
                type="number"
                step="0.1"
                min="0"
                defaultValue={dieselLiters ?? undefined}
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`approve-dieselDate-${requestId}`} className="text-base">
                Diesel Date
              </Label>
              <Input
                key={dieselDateValue}
                id={`approve-dieselDate-${requestId}`}
                name="dieselDate"
                type="date"
                defaultValue={dieselDateValue}
                className="h-12 text-base"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`approve-notes-${requestId}`} className="text-base">
              Note (Optional)
            </Label>
            <Textarea
              key={notes}
              id={`approve-notes-${requestId}`}
              name="notes"
              defaultValue={notes ?? ""}
              className="min-h-20"
            />
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
              {pending ? "Approving..." : "Approve & Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
