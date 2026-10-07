"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FormAlert } from "@/components/bill/editor/form-parts";
import { useIdempotencyKey } from "@/components/bill/use-idempotency-key";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";

import { todayLocal } from "@/lib/utils/dates";
type Payment = {
  id: string;
  /** The version this row was loaded at — sent back as expectedVersion so an
   * edit made elsewhere in the meantime is reported instead of overwritten. */
  version: number;
  amount: number;
  date: Date;
  method: string | null;
  notes: string | null;
};

/** After a conflict (someone else changed the bill/payment, or paid it off)
 * reload what is on screen so the next attempt starts from the truth. */
const REFRESH_ON = new Set(["RESOURCE_MODIFIED", "PAYMENT_EXCEEDS_BALANCE", "NOT_FOUND"]);

/** Payment fields. Date sits beside the amount only when there is room for both
 * (a native date field needs ~145px). */
function PaymentFields({
  defaults,
  max,
  amountKey,
}: {
  defaults: { amount: number; date: string; method: string; notes: string };
  max?: number;
  amountKey?: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-3 @min-[302px]:grid-cols-2">
      <Field label="Amount">
        {(id) => (
          <Input
            id={id}
            key={amountKey}
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            max={max}
            inputMode="decimal"
            defaultValue={defaults.amount}
            required
            className="h-11"
          />
        )}
      </Field>
      <Field label="Date">
        {(id) => <Input id={id} name="date" type="date" defaultValue={defaults.date} required className="h-11 px-2" />}
      </Field>
      <Field label="Method (Optional)">
        {(id) => (
          <Input id={id} name="method" placeholder="Cash / UPI / Bank" defaultValue={defaults.method} className="h-11" />
        )}
      </Field>
      <Field label="Notes (Optional)">
        {(id) => <Input id={id} name="notes" defaultValue={defaults.notes} className="h-11" />}
      </Field>
    </div>
  );
}

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
  const today = todayLocal();
  const refresh = () =>
    mutate((k) => typeof k === "string" && (k.startsWith("/api/bills") || k.startsWith("/api/dashboard")));
  // One key per "Save Payment" submission: tapping Save again after a timeout
  // re-sends it and the server replays the first result instead of recording
  // the money twice.
  const idem = useIdempotencyKey();
  const { error, pending: submitting, run } = useApiForm(async (body: Record<string, unknown>) => {
    try {
      await idem.submit((idempotencyKey) =>
        apiFetch(`/api/bills/${billId}/payments`, { method: "POST", body: JSON.stringify(body), idempotencyKey }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.code && REFRESH_ON.has(err.code)) await refresh();
      throw err;
    }
    await refresh();
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Payments</h2>
          {pending > 0.01 && !showForm && (
            <Button type="button" className="h-11 px-3" onClick={() => setShowForm(true)}>
              <Plus aria-hidden className="size-4" />
              Give Money
            </Button>
          )}
        </div>

        {payments.length === 0 && <p className="text-sm text-muted-foreground">No payments recorded yet.</p>}
        {payments.map((p) => (
          <PaymentRow key={p.id} billId={billId} payment={p} />
        ))}

        {showForm && (
          <form onSubmit={onSubmit} className="@container flex flex-col gap-3 rounded-lg border border-dashed p-3">
            <PaymentFields
              defaults={{ amount: pending, date: today, method: "", notes: "" }}
              max={pending}
              amountKey={pending}
            />
            {error && <FormAlert>{error}</FormAlert>}
            <div className="flex gap-2">
              <Button type="submit" className="h-11 px-4" disabled={submitting}>
                {submitting ? "Saving..." : "Save Payment"}
              </Button>
              <Button type="button" variant="ghost" className="h-11 px-4" onClick={() => setShowForm(false)}>
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
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // The version this row's form was opened at — an edit made elsewhere while
  // the form is open must be reported, not overwritten, even if SWR has since
  // revalidated `p` to the newer row.
  const [openedAtVersion, setOpenedAtVersion] = useState(p.version);
  const refresh = () =>
    mutate((k) => typeof k === "string" && (k.startsWith("/api/bills") || k.startsWith("/api/dashboard")));
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    try {
      await apiFetch(`/api/bills/${billId}/payments/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...body, expectedVersion: openedAtVersion }),
      });
    } catch (err) {
      if (err instanceof ApiError && err.code && REFRESH_ON.has(err.code)) await refresh();
      throw err;
    }
    await refresh();
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
    setDeleteError(null);
    try {
      await apiFetch(`/api/bills/${billId}/payments/${p.id}?expectedVersion=${p.version}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the payment");
      if (err instanceof ApiError && err.code && REFRESH_ON.has(err.code)) await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={onSubmit} className="@container flex flex-col gap-3 rounded-lg border border-dashed p-3">
        <PaymentFields
          defaults={{
            amount: p.amount,
            date: new Date(p.date).toISOString().slice(0, 10),
            method: p.method ?? "",
            notes: p.notes ?? "",
          }}
        />
        {error && <FormAlert>{error}</FormAlert>}
        <div className="flex gap-2">
          <Button type="submit" className="h-11 px-4" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="ghost" className="h-11 px-4" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="border-b py-2 text-sm last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1 basis-36 break-words">
          <p className="font-medium">{formatDate(p.date)}</p>
          {p.method && <p className="text-muted-foreground">{p.method}</p>}
          {p.notes && <p className="text-muted-foreground">{p.notes}</p>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <p className="mr-1 font-semibold text-emerald-700 dark:text-working">{formatCurrency(p.amount)}</p>
          <Button
            type="button"
            variant="ghost"
            className="size-11 md:size-8"
            aria-label={`Edit payment of ${formatCurrency(p.amount)} on ${formatDate(p.date)}`}
            onClick={() => {
              setOpenedAtVersion(p.version);
              setEditing(true);
            }}
          >
            <Pencil aria-hidden className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Delete payment of ${formatCurrency(p.amount)} on ${formatDate(p.date)}`}
            className="size-11 text-muted-foreground hover:text-destructive md:size-8"
            onClick={onDelete}
            disabled={busy}
          >
            <Trash2 aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
      {deleteError && <FormAlert className="mt-1">{deleteError}</FormAlert>}
    </div>
  );
}
