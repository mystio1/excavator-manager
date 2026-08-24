"use client";

import { useActionState, useMemo, useState } from "react";
import { FileText, Receipt } from "lucide-react";
import { generateBillAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/native-select";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

type Session = {
  id: string;
  excavatorName: string;
  machineNumber: string | null;
  siteName: string;
  startDate: string;
  endDate: string;
  totalHours: number;
};

type BankAccount = {
  id: string;
  label: string;
  isDefaultForGst: boolean;
  isDefaultForNonGst: boolean;
};

const TAX_RATES = [5, 12, 18, 28];

export function GenerateBillForm({
  customerId,
  sessions,
  bankAccounts,
  businessGstNumber,
  nextNonGstNumber,
}: {
  customerId: string;
  sessions: Session[];
  bankAccounts: BankAccount[];
  businessGstNumber: string | null;
  nextNonGstNumber: string;
}) {
  const [state, formAction, isPending] = useActionState(generateBillAction, undefined);

  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(sessions.map((s) => [s.id, true])),
  );
  const [ratePerHour, setRatePerHour] = useState(0);
  const [transportCharges, setTransportCharges] = useState(0);
  const [fuelCharges, setFuelCharges] = useState(0);
  const [extraCharges, setExtraCharges] = useState(0);
  const [bucketCharge, setBucketCharge] = useState(0);
  const [breakerCharge, setBreakerCharge] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [billType, setBillType] = useState<"GST" | "NON_GST">("NON_GST");
  const [gstPercentage, setGstPercentage] = useState(18);
  const [manualNonGstNumber, setManualNonGstNumber] = useState(false);
  const [showCustomerPhone, setShowCustomerPhone] = useState(true);

  const defaultBankId =
    bankAccounts.find((b) => (billType === "GST" ? b.isDefaultForGst : b.isDefaultForNonGst))?.id ?? "";

  const selectedSessions = sessions.filter((s) => selected[s.id]);
  const totalHours = selectedSessions.reduce((sum, s) => sum + s.totalHours, 0);

  const totals = useMemo(() => {
    const subtotal = Math.round(totalHours * ratePerHour * 100) / 100;
    const taxable =
      subtotal + transportCharges + fuelCharges + extraCharges + bucketCharge + breakerCharge - discount;
    const tax = billType === "GST" ? Math.round(((taxable * gstPercentage) / 100) * 100) / 100 : 0;
    return { subtotal, taxable, tax, total: Math.round((taxable + tax) * 100) / 100 };
  }, [
    totalHours,
    ratePerHour,
    transportCharges,
    fuelCharges,
    extraCharges,
    bucketCharge,
    breakerCharge,
    discount,
    billType,
    gstPercentage,
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const noSelection = selectedSessions.length === 0;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={customerId} />

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold">Select Work Records</p>
            {sessions.length > 0 && (
              <div className="flex gap-3 text-sm font-semibold text-primary">
                <button
                  type="button"
                  onClick={() => setSelected(Object.fromEntries(sessions.map((s) => [s.id, true])))}
                  disabled={selectedSessions.length === sessions.length}
                  className="disabled:opacity-40"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelected({})}
                  disabled={selectedSessions.length === 0}
                  className="disabled:opacity-40"
                >
                  Deselect All
                </button>
              </div>
            )}
          </div>
          {sessions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No completed, unbilled work found for this customer yet.
            </p>
          )}
          {sessions.map((s) => (
            <label
              key={s.id}
              className="flex items-start gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/40"
            >
              <input
                type="checkbox"
                name="workSessionIds"
                value={s.id}
                checked={!!selected[s.id]}
                onChange={(e) => setSelected((prev) => ({ ...prev, [s.id]: e.target.checked }))}
                className="mt-1 size-4"
              />
              <span className="flex-1">
                <span className="block font-semibold">
                  {s.excavatorName}
                  {s.machineNumber ? ` (${s.machineNumber})` : ""}
                </span>
                <span className="block text-muted-foreground">
                  {s.siteName} · {formatDate(new Date(s.startDate))} – {formatDate(new Date(s.endDate))}
                </span>
              </span>
              <span className="font-semibold">{s.totalHours} hrs</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-base font-semibold">Rate &amp; Charges</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Rate per Hour</Label>
              <Input
                name="ratePerHour"
                type="number"
                min="0"
                step="1"
                value={ratePerHour || ""}
                onChange={(e) => setRatePerHour(Number(e.target.value) || 0)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Bill Date</Label>
              <Input name="billDate" type="date" defaultValue={today} required className="h-11" />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Transport Charges</Label>
              <Input
                name="transportCharges"
                type="number"
                min="0"
                value={transportCharges || ""}
                onChange={(e) => setTransportCharges(Number(e.target.value) || 0)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Fuel Charges</Label>
              <Input
                name="fuelCharges"
                type="number"
                min="0"
                value={fuelCharges || ""}
                onChange={(e) => setFuelCharges(Number(e.target.value) || 0)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Extra Charges</Label>
              <Input
                name="extraCharges"
                type="number"
                min="0"
                value={extraCharges || ""}
                onChange={(e) => setExtraCharges(Number(e.target.value) || 0)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Discount</Label>
              <Input
                name="discount"
                type="number"
                min="0"
                value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                className="h-11"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-base font-semibold">Tool Charges</p>
          <p className="text-sm text-muted-foreground">
            Bill extra for a specific attachment used during this work, if any.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Bucket Charge</Label>
              <Input
                name="bucketCharge"
                type="number"
                min="0"
                value={bucketCharge || ""}
                onChange={(e) => setBucketCharge(Number(e.target.value) || 0)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Breaker Charge</Label>
              <Input
                name="breakerCharge"
                type="number"
                min="0"
                value={breakerCharge || ""}
                onChange={(e) => setBreakerCharge(Number(e.target.value) || 0)}
                className="h-11"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-base font-semibold">Bill Type</p>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => setBillType("NON_GST")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold",
                billType === "NON_GST" ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              <Receipt className="size-4" /> Non-GST
            </button>
            <button
              type="button"
              onClick={() => setBillType("GST")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold",
                billType === "GST" ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              <FileText className="size-4" /> GST Bill
            </button>
          </div>
          <input type="hidden" name="billType" value={billType} />

          {billType === "NON_GST" ? (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={manualNonGstNumber}
                  onChange={(e) => setManualNonGstNumber(e.target.checked)}
                  className="size-4"
                />
                Enter bill number manually
              </label>
              {manualNonGstNumber ? (
                <Input name="billNumber" placeholder="e.g. NG-0059" required className="h-11" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Next bill number: <span className="font-semibold text-foreground">{nextNonGstNumber}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4 rounded-xl border border-dashed p-3">
              <div className="flex flex-col gap-2">
                <Label className="text-sm">GST Bill Number</Label>
                <Input name="billNumber" placeholder="e.g. INV-0012" required className="h-11" />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-sm">GST Rate</Label>
                <div className="flex gap-2">
                  {TAX_RATES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setGstPercentage(r)}
                      className={cn(
                        "flex-1 rounded-lg border py-2 text-sm font-semibold",
                        gstPercentage === r ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {r}%
                    </button>
                  ))}
                </div>
                <input type="hidden" name="gstPercentage" value={gstPercentage} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label className="text-sm">Seller GSTIN</Label>
                  <Input value={businessGstNumber ?? "Set in Settings"} disabled className="h-11" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-sm">Buyer GSTIN (Optional)</Label>
                  <Input name="buyerGstin" className="h-11" />
                </div>
              </div>
            </div>
          )}

          {bankAccounts.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Bank Account to Print on Bill</Label>
              <NativeSelect name="bankAccountId" defaultValue={defaultBankId} className="h-11">
                <option value="">None</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="showCustomerPhone"
              checked={showCustomerPhone}
              onChange={(e) => setShowCustomerPhone(e.target.checked)}
              className="size-4"
            />
            Show customer&rsquo;s phone number on bill
          </label>

          <div className="flex flex-col gap-2">
            <Label className="text-sm">Notes (Optional)</Label>
            <Input name="notes" className="h-11" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          <p className="mb-1 text-base font-semibold">Review Amount</p>
          <div className="flex justify-between text-muted-foreground">
            <span>Hours × Rate ({totalHours} hrs)</span>
            <span className="tabular-nums">{formatCurrency(totals.subtotal)}</span>
          </div>
          {(transportCharges > 0 || fuelCharges > 0 || extraCharges > 0) && (
            <div className="flex justify-between text-muted-foreground">
              <span>Transport + Fuel + Extra</span>
              <span className="tabular-nums">
                {formatCurrency(transportCharges + fuelCharges + extraCharges)}
              </span>
            </div>
          )}
          {bucketCharge > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Bucket Charge</span>
              <span className="tabular-nums">{formatCurrency(bucketCharge)}</span>
            </div>
          )}
          {breakerCharge > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Breaker Charge</span>
              <span className="tabular-nums">{formatCurrency(breakerCharge)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span className="tabular-nums">-{formatCurrency(discount)}</span>
            </div>
          )}
          {billType === "GST" && (
            <div className="flex justify-between text-muted-foreground">
              <span>GST ({gstPercentage}%)</span>
              <span className="tabular-nums">{formatCurrency(totals.tax)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t pt-2 text-lg font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(totals.total)}</span>
          </div>
        </CardContent>
      </Card>

      {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}

      <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending || noSelection}>
        {isPending ? "Generating..." : "Generate Bill"}
      </Button>
    </form>
  );
}
