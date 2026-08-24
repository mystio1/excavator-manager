"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { addPaymentAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";

type Payment = {
  id: string;
  amount: number;
  date: Date;
  method: string | null;
  notes: string | null;
};

export function PaymentSection({
  billId,
  pending,
  payments,
}: {
  billId: string;
  pending: number;
  payments: Payment[];
}) {
  const [state, formAction, isPending] = useActionState(addPaymentAction, undefined);
  const [showForm, setShowForm] = useState(false);
  const wasPending = useRef(false);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setShowForm(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold">Payments</p>
          {pending > 0.01 && !showForm && (
            <Button type="button" size="sm" onClick={() => setShowForm(true)}>
              <Plus className="size-4" />
              Give Money
            </Button>
          )}
        </div>

        {payments.length === 0 && <p className="text-sm text-muted-foreground">No payments recorded yet.</p>}
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
            <div>
              <p className="font-medium">{formatDate(p.date)}</p>
              {p.method && <p className="text-muted-foreground">{p.method}</p>}
              {p.notes && <p className="text-muted-foreground">{p.notes}</p>}
            </div>
            <p className="font-semibold text-working">{formatCurrency(p.amount)}</p>
          </div>
        ))}

        {showForm && (
          <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
            <input type="hidden" name="billId" value={billId} />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Amount</Label>
                <Input
                  key={pending}
                  name="amount"
                  type="number"
                  min="1"
                  step="1"
                  max={pending}
                  defaultValue={pending}
                  required
                  className="h-11"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Date</Label>
                <Input name="date" type="date" defaultValue={today} required className="h-11" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Method (Optional)</Label>
                <Input name="method" placeholder="Cash / UPI / Bank" className="h-11" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Notes (Optional)</Label>
                <Input name="notes" className="h-11" />
              </div>
            </div>
            {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Payment"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
