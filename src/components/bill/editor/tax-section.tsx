"use client";

import { useId } from "react";
import { FileText, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { cn } from "@/lib/utils";
import { billNumberEntry, TAX_RATES } from "./bill-math";
import { ChoiceChip, CheckboxField, Field } from "./form-parts";
import type { BillFields, BillFormOptions, BillType } from "./types";

const BILL_TYPES: { type: BillType; label: string; icon: typeof FileText }[] = [
  { type: "NON_GST", label: "Non-GST", icon: Receipt },
  { type: "GST", label: "GST Bill", icon: FileText },
];

/** Bill type and everything that depends on it: GST rate and GSTINs, the bill
 * number (auto, manual or typed), the bank account printed on the bill, the
 * customer-phone toggle and notes. */
export function TaxSection({
  mode,
  options,
  fields,
  onChange,
  onBillTypeChange,
}: {
  mode: "create" | "edit";
  options: Pick<BillFormOptions, "bankAccounts" | "businessGstNumber" | "nextNonGstNumber">;
  fields: BillFields;
  onChange: <K extends keyof BillFields>(key: K, value: BillFields[K]) => void;
  onBillTypeChange: (type: BillType) => void;
}) {
  const rateLabelId = useId();
  const typedNumber = billNumberEntry(mode, fields.billType) === "typed";

  return (
    <Card>
      <CardContent className="@container flex flex-col gap-4">
        <h2 className="text-base font-semibold">Bill Type</h2>
        <div role="group" aria-label="Bill type" className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
          {BILL_TYPES.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              type="button"
              aria-pressed={fields.billType === type}
              onClick={() => onBillTypeChange(type)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                fields.billType === type ? "bg-card shadow-sm" : "text-foreground/70",
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {fields.billType === "GST" && (
          <div className="flex flex-col gap-4">
            <div role="group" aria-labelledby={rateLabelId} className="flex flex-col gap-2">
              <p id={rateLabelId} className="text-sm font-medium">
                GST Rate
              </p>
              <div className="flex gap-2">
                {TAX_RATES.map((r) => (
                  <ChoiceChip
                    key={r}
                    selected={fields.gstPercentage === r}
                    onClick={() => onChange("gstPercentage", r)}
                    className="flex-1 px-1"
                  >
                    {r}%
                  </ChoiceChip>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 @min-[420px]:grid-cols-2">
              <Field label="Seller GSTIN">
                {(id) => <Input id={id} value={options.businessGstNumber ?? "Set in Settings"} disabled className="h-11" />}
              </Field>
              <Field label="Buyer GSTIN (Optional)">
                {(id) => (
                  <Input
                    id={id}
                    value={fields.buyerGstin}
                    onChange={(e) => onChange("buyerGstin", e.target.value)}
                    autoCapitalize="characters"
                    className="h-11"
                  />
                )}
              </Field>
            </div>
          </div>
        )}

        {typedNumber ? (
          <Field label="Bill Number">
            {(id) => (
              <Input
                id={id}
                value={fields.billNumber}
                onChange={(e) => onChange("billNumber", e.target.value)}
                placeholder={fields.billType === "GST" ? "e.g. INV-0012" : "e.g. NG-0059"}
                required
                className="h-11"
              />
            )}
          </Field>
        ) : (
          <div className="flex flex-col gap-2">
            <CheckboxField checked={fields.manualNumber} onChange={(v) => onChange("manualNumber", v)}>
              Enter bill number manually
            </CheckboxField>
            {fields.manualNumber ? (
              <Field label="Bill Number">
                {(id) => (
                  <Input
                    id={id}
                    value={fields.billNumber}
                    onChange={(e) => onChange("billNumber", e.target.value)}
                    placeholder="e.g. NG-0059"
                    required
                    className="h-11"
                  />
                )}
              </Field>
            ) : (
              <p className="text-sm text-muted-foreground">
                Next bill number: <span className="font-semibold text-foreground">{options.nextNonGstNumber}</span>
              </p>
            )}
          </div>
        )}

        {options.bankAccounts.length > 0 && (
          <Field label="Bank Account to Print on Bill">
            {(id) => (
              <NativeSelect
                id={id}
                value={fields.bankAccountId}
                onChange={(e) => onChange("bankAccountId", e.target.value)}
                className="h-11 min-w-0"
              >
                <option value="">None</option>
                {options.bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        )}

        <CheckboxField checked={fields.showCustomerPhone} onChange={(v) => onChange("showCustomerPhone", v)}>
          Show customer&rsquo;s phone number on bill
        </CheckboxField>

        <Field label="Notes (Optional)">
          {(id) => (
            <Input id={id} value={fields.notes} onChange={(e) => onChange("notes", e.target.value)} className="h-11" />
          )}
        </Field>
      </CardContent>
    </Card>
  );
}
