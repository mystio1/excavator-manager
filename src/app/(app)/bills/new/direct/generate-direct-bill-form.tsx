"use client";

import { useActionState, useMemo, useState } from "react";
import { FileText, Receipt } from "lucide-react";
import { generateDirectBillAction } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/native-select";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";

type Excavator = {
  id: string;
  name: string;
  machineNumber: string | null;
};

type BankAccount = {
  id: string;
  label: string;
  isDefaultForGst: boolean;
  isDefaultForNonGst: boolean;
};

const TAX_RATES = [5, 12, 18, 28];

export function GenerateDirectBillForm({
  customerId,
  excavators,
  bankAccounts,
  businessGstNumber,
  nextNonGstNumber,
}: {
  customerId: string;
  excavators: Excavator[];
  bankAccounts: BankAccount[];
  businessGstNumber: string | null;
  nextNonGstNumber: string;
}) {
  const [state, formAction, isPending] = useActionState(generateDirectBillAction, undefined);

  const [bucketHours, setBucketHours] = useState(0);
  const [bucketRate, setBucketRate] = useState(0);
  const [breakerHours, setBreakerHours] = useState(0);
  const [breakerRate, setBreakerRate] = useState(0);
  const [transportCharges, setTransportCharges] = useState(0);
  const [dieselLiters, setDieselLiters] = useState(0);
  const [dieselPricePerLiter, setDieselPricePerLiter] = useState(0);
  const [billType, setBillType] = useState<"GST" | "NON_GST">("NON_GST");
  const [gstPercentage, setGstPercentage] = useState(18);
  const [manualNonGstNumber, setManualNonGstNumber] = useState(false);
  const [showCustomerPhone, setShowCustomerPhone] = useState(true);

  const defaultBankId =
    bankAccounts.find((b) => (billType === "GST" ? b.isDefaultForGst : b.isDefaultForNonGst))?.id ?? "";

  const totals = useMemo(() => {
    const bucketAmount = Math.round(bucketHours * bucketRate * 100) / 100;
    const breakerAmount = Math.round(breakerHours * breakerRate * 100) / 100;
    const subtotal = Math.round((bucketAmount + breakerAmount) * 100) / 100;
    const taxable = Math.round((subtotal + transportCharges) * 100) / 100;
    const tax = billType === "GST" ? Math.round(((taxable * gstPercentage) / 100) * 100) / 100 : 0;
    const dieselAdvance = Math.round(dieselLiters * dieselPricePerLiter * 100) / 100;
    const total = Math.round((taxable + tax - dieselAdvance) * 100) / 100;
    return { bucketAmount, breakerAmount, subtotal, taxable, tax, dieselAdvance, total };
  }, [bucketHours, bucketRate, breakerHours, breakerRate, transportCharges, billType, gstPercentage, dieselLiters, dieselPricePerLiter]);

  const today = new Date().toISOString().slice(0, 10);
  const nothingBillable = totals.taxable <= 0;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={customerId} />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-base font-semibold">Machine &amp; Period</p>
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Machine</Label>
            {excavators.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add a machine first.</p>
            ) : (
              <NativeSelect name="excavatorId" required defaultValue="" className="h-11">
                <option value="" disabled>
                  Choose a machine
                </option>
                {excavators.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.machineNumber ? ` (${e.machineNumber})` : ""}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Bill Date</Label>
              <Input name="billDate" type="date" defaultValue={today} required className="h-11" />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">From Date</Label>
              <Input name="fromDate" type="date" defaultValue={today} required className="h-11" />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">To Date</Label>
              <Input name="toDate" type="date" defaultValue={today} required className="h-11" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-base font-semibold">Bucket &amp; Breaker Hours</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Bucket Hours</Label>
              <Input
                name="bucketHours"
                type="number"
                min="0"
                step="0.1"
                value={bucketHours || ""}
                onChange={(e) => setBucketHours(Number(e.target.value) || 0)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Bucket Rate / Hour</Label>
              <Input
                name="bucketRate"
                type="number"
                min="0"
                value={bucketRate || ""}
                onChange={(e) => setBucketRate(Number(e.target.value) || 0)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Breaker Hours</Label>
              <Input
                name="breakerHours"
                type="number"
                min="0"
                step="0.1"
                value={breakerHours || ""}
                onChange={(e) => setBreakerHours(Number(e.target.value) || 0)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Breaker Rate / Hour</Label>
              <Input
                name="breakerRate"
                type="number"
                min="0"
                value={breakerRate || ""}
                onChange={(e) => setBreakerRate(Number(e.target.value) || 0)}
                className="h-11"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-base font-semibold">Transport &amp; Diesel</p>
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Transport Charges (if applicable)</Label>
            <Input
              name="transportCharges"
              type="number"
              min="0"
              placeholder="Leave blank if not applicable"
              value={transportCharges || ""}
              onChange={(e) => setTransportCharges(Number(e.target.value) || 0)}
              className="h-11"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Diesel supplied by the customer is deducted from the total as an advance.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Diesel Litres</Label>
              <Input
                name="dieselLiters"
                type="number"
                min="0"
                step="0.01"
                value={dieselLiters || ""}
                onChange={(e) => setDieselLiters(Number(e.target.value) || 0)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Diesel Price / Litre</Label>
              <Input
                name="dieselPricePerLiter"
                type="number"
                min="0"
                step="0.01"
                value={dieselPricePerLiter || ""}
                onChange={(e) => setDieselPricePerLiter(Number(e.target.value) || 0)}
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
          {bucketHours > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Bucket Hours ({bucketHours} hrs)</span>
              <span className="tabular-nums">{formatCurrency(totals.bucketAmount)}</span>
            </div>
          )}
          {breakerHours > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Breaker Hours ({breakerHours} hrs)</span>
              <span className="tabular-nums">{formatCurrency(totals.breakerAmount)}</span>
            </div>
          )}
          {transportCharges > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Transport</span>
              <span className="tabular-nums">{formatCurrency(transportCharges)}</span>
            </div>
          )}
          {billType === "GST" && (
            <div className="flex justify-between text-muted-foreground">
              <span>GST ({gstPercentage}%)</span>
              <span className="tabular-nums">{formatCurrency(totals.tax)}</span>
            </div>
          )}
          {totals.dieselAdvance > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Diesel Advance</span>
              <span className="tabular-nums">-{formatCurrency(totals.dieselAdvance)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t pt-2 text-lg font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(totals.total)}</span>
          </div>
        </CardContent>
      </Card>

      {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}

      <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending || nothingBillable}>
        {isPending ? "Generating..." : "Generate Bill"}
      </Button>
    </form>
  );
}
