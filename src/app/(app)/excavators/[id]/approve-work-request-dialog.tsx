"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { approveWorkRequestAction } from "../../operators/actions";
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
  const [state, formAction, isPending] = useActionState(approveWorkRequestAction, undefined);
  const [open, setOpen] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(customers.length === 0);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  const dieselDateValue = dieselDate ? dieselDate.toISOString().slice(0, 10) : "";

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
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="requestId" value={requestId} />

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

          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={isPending}>
              {isPending ? "Approving..." : "Approve & Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
