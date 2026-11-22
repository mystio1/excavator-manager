"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Trash2 } from "lucide-react";
import { apiFetch, swrFetcher } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import type { listExpenses } from "@/lib/services/expenses";
import type { Plain } from "@/lib/plain";
import { EXPENSE_TYPES, EXPENSE_TYPE_LABEL } from "@/lib/validation/expense";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate, todayLocal } from "@/lib/utils/dates";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { EmptyState } from "@/components/empty-state";
import { Wallet } from "lucide-react";
import Loading from "../loading";

type Data = {
  expenses: Plain<Awaited<ReturnType<typeof listExpenses>>>;
  excavators: { id: string; name: string; machineNumber: string | null }[];
};

const KEY = "/api/expenses";

/** Money spent on machines — diesel bought, repairs, parts, tyres. Counted in the dashboard profit. */
export default function ExpensesPage() {
  const { data } = useSWR<Data>(KEY, swrFetcher);
  if (!data) return <Loading />;
  const total = data.expenses.reduce((a, e) => a + Number(e.amount), 0);

  return (
    <div>
      <PageHeader title="Expenses" backHref="/dashboard" />
      <div className="flex flex-col gap-4 px-4 pb-6 md:px-8">
        <AddExpenseCard excavators={data.excavators} />

        {data.expenses.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No expenses recorded yet"
            description="Record diesel you buy, repairs, parts and tyres. They are subtracted in the dashboard's Business Profit."
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-baseline justify-between gap-2 text-base">
                <span>Recorded Expenses</span>
                <span className="text-sm font-semibold text-muted-foreground">
                  {data.expenses.length} · {formatCurrency(Math.round(total * 100) / 100)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col">
              {data.expenses.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-3 border-b py-3 last:border-b-0">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {EXPENSE_TYPE_LABEL[e.type as keyof typeof EXPENSE_TYPE_LABEL] ?? e.type}
                      <span className="font-normal text-muted-foreground"> · {e.excavator.name}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(new Date(e.date))}
                      {e.notes ? ` · ${e.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="font-bold tabular-nums whitespace-nowrap">{formatCurrency(Number(e.amount))}</span>
                    <DeleteExpenseButton id={e.id} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function AddExpenseCard({ excavators }: { excavators: Data["excavators"] }) {
  const { mutate } = useSWRConfig();
  const [formKey, setFormKey] = useState(0);
  const [saved, setSaved] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch(KEY, { method: "POST", body: JSON.stringify(body) });
    await mutate((k) => typeof k === "string" && (k.startsWith(KEY) || k.startsWith("/api/dashboard")));
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      excavatorId: fd.get("excavatorId"),
      date: fd.get("date"),
      type: fd.get("type"),
      amount: Number(fd.get("amount")),
      notes: (fd.get("notes") as string) || undefined,
    });
    if (ok) {
      setSaved(true);
      setFormKey((k) => k + 1);
    }
  }

  if (excavators.length === 0) {
    return <p className="text-sm text-muted-foreground">Add a machine first — every expense belongs to a machine.</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add Expense</CardTitle>
      </CardHeader>
      <CardContent>
        <form key={formKey} onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="exp-machine">Machine</Label>
            <NativeSelect id="exp-machine" name="excavatorId" required defaultValue="" className="h-11">
              <option value="" disabled>
                Choose a machine
              </option>
              {excavators.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.machineNumber ? ` (${m.machineNumber})` : ""}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="exp-type">Type</Label>
            <NativeSelect id="exp-type" name="type" required defaultValue="DIESEL" className="h-11">
              {EXPENSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EXPENSE_TYPE_LABEL[t]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="exp-amount">Amount (₹)</Label>
            <Input id="exp-amount" name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="exp-date">Date</Label>
            <Input id="exp-date" name="date" type="date" defaultValue={todayLocal()} required className="h-11" />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="exp-notes">Notes (Optional)</Label>
            <Input id="exp-notes" name="notes" placeholder="e.g. 200 L from Shree Petroleum" className="h-11" />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2">{error}</p>}
          {saved && !error && <p role="status" className="text-sm font-medium text-working sm:col-span-2">Saved.</p>}
          <Button type="submit" size="lg" className="h-11 sm:col-span-2 sm:justify-self-start" disabled={pending}>
            {pending ? "Saving..." : "Add Expense"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DeleteExpenseButton({ id }: { id: string }) {
  const { mutate } = useSWRConfig();
  const { pending, run } = useApiForm(async () => {
    await apiFetch(`${KEY}/${id}`, { method: "DELETE" });
    await mutate((k) => typeof k === "string" && (k.startsWith(KEY) || k.startsWith("/api/dashboard")));
  });
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label="Delete expense"
      disabled={pending}
      onClick={() => {
        if (window.confirm("Delete this expense?")) void run(undefined);
      }}
    >
      <Trash2 className="size-4 text-muted-foreground" />
    </Button>
  );
}
