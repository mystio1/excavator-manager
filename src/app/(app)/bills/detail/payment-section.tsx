"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
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
  const { mutate } = useSWRConfig();
  const [showForm, setShowForm] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const { error, pending: submitting, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch(`/api/bills/${billId}/payments`, { method: "POST", body: JSON.stringify(body) });
    await mutate(`/api/bills/${billId}`);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      amount: Number(fd.get("amount")),
      date: fd.get("date"),
      method: fd.get("method") || undefined,
      notes: fd.get("notes") || undefined,
    });
    if (ok) setShowForm(false);
  }

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
          <PaymentRow key={p.id} billId={billId} payment={p} />
        ))}

        {showForm && (
          <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
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
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save Payment"}
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

function PaymentRow({ billId, payment: p }: { billId: string; payment: Payment }) {
  const { mutate } = useSWRConfig();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch(`/api/bills/${billId}/payments/${p.id}`, { method: "PATCH", body: JSON.stringify(body) });
    await mutate((k) => typeof k === "string" && (k.startsWith("/api/bills") || k.startsWith("/api/dashboard")));
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      amount: Number(fd.get("amount")),
      date: fd.get("date"),
      method: fd.get("method") || undefined,
      notes: fd.get("notes") || undefined,
    });
    if (ok) setEditing(false);
  }

  async function onDelete() {
    if (!window.confirm("Delete this payment?")) return;
    setBusy(true);
    try {
      await apiFetch(`/api/bills/${billId}/payments/${p.id}`, { method: "DELETE" });
      await mutate((k) => typeof k === "string" && (k.startsWith("/api/bills") || k.startsWith("/api/dashboard")));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
        <div className="grid grid-cols-2 gap-3">
          <Input name="amount" type="number" min="1" step="any" defaultValue={p.amount} required className="h-11" />
          <Input name="date" type="date" defaultValue={new Date(p.date).toISOString().slice(0, 10)} required className="h-11" />
          <Input name="method" placeholder="Method" defaultValue={p.method ?? ""} className="h-11" />
          <Input name="notes" placeholder="Notes" defaultValue={p.notes ?? ""} className="h-11" />
        </div>
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
      <div className="min-w-0">
        <p className="font-medium">{formatDate(p.date)}</p>
        {p.method && <p className="text-muted-foreground">{p.method}</p>}
        {p.notes && <p className="text-muted-foreground">{p.notes}</p>}
      </div>
      <div className="flex items-center gap-1">
        <p className="mr-1 font-semibold text-working">{formatCurrency(p.amount)}</p>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Edit payment" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Delete payment"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={busy}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
