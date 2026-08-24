"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { addBankAccountAction, archiveBankAccountAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type BankAccount = {
  id: string;
  label: string;
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branch: string | null;
  isDefaultForGst: boolean;
  isDefaultForNonGst: boolean;
};

export function BankAccountsSection({ accounts }: { accounts: BankAccount[] }) {
  const [showForm, setShowForm] = useState(accounts.length === 0);
  const [state, formAction, isPending] = useActionState(addBankAccountAction, undefined);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setShowForm(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Bank Accounts</CardTitle>
        {!showForm && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setShowForm(true)}>
            <Plus className="size-4" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {accounts.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground">
            No bank accounts yet. Add one so it can be printed on bills.
          </p>
        )}

        {accounts.map((acc) => (
          <div key={acc.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="text-sm">
              <p className="font-bold">{acc.label}</p>
              <p className="text-muted-foreground">
                {acc.bankName} — {acc.accountNumber} — {acc.ifsc}
              </p>
              <p className="text-muted-foreground">{acc.accountHolderName}</p>
              <div className="mt-1 flex gap-1.5">
                {acc.isDefaultForGst && <Badge variant="secondary">Default for GST</Badge>}
                {acc.isDefaultForNonGst && <Badge variant="secondary">Default for Non-GST</Badge>}
              </div>
            </div>
            <form action={archiveBankAccountAction}>
              <input type="hidden" name="id" value={acc.id} />
              <button type="submit" className="p-2 text-muted-foreground hover:text-destructive" aria-label="Remove">
                <Trash2 className="size-4" />
              </button>
            </form>
          </div>
        ))}

        {showForm && (
          <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="label" className="text-sm">
                  Label
                </Label>
                <Input id="label" name="label" placeholder="e.g. Main Account" required className="h-11" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="accountHolderName" className="text-sm">
                  Account Holder Name
                </Label>
                <Input id="accountHolderName" name="accountHolderName" required className="h-11" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bankName" className="text-sm">
                  Bank Name
                </Label>
                <Input id="bankName" name="bankName" required className="h-11" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="branch" className="text-sm">
                  Branch
                </Label>
                <Input id="branch" name="branch" className="h-11" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="accountNumber" className="text-sm">
                  Account Number
                </Label>
                <Input id="accountNumber" name="accountNumber" required className="h-11" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ifsc" className="text-sm">
                  IFSC Code
                </Label>
                <Input id="ifsc" name="ifsc" required className="h-11" />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="isDefaultForGst" className="size-4" />
                Default for GST bills
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="isDefaultForNonGst" className="size-4" />
                Default for Non-GST bills
              </label>
            </div>
            {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Account"}
              </Button>
              {accounts.length > 0 && (
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
