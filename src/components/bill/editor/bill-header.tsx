"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { Field } from "./form-parts";
import type { BillFormOptions } from "./types";

/** Who the bill is for and its date. */
export function BillHeader({
  customers,
  customerId,
  billDate,
  onCustomerChange,
  onDateChange,
}: {
  customers: BillFormOptions["customers"];
  customerId: string;
  billDate: string;
  onCustomerChange: (id: string) => void;
  onDateChange: (date: string) => void;
}) {
  return (
    <Card>
      <CardContent className="@container">
        <div className="grid grid-cols-1 gap-4 @min-[330px]:grid-cols-2">
          <Field label="Customer">
            {(id) => (
              <NativeSelect
                id={id}
                value={customerId}
                onChange={(e) => onCustomerChange(e.target.value)}
                required
                className="h-11 min-w-0"
              >
                <option value="" disabled>
                  Choose a customer
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.companyName ? ` (${c.companyName})` : ""}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Bill Date">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={billDate}
                onChange={(e) => onDateChange(e.target.value)}
                required
                className="h-11"
              />
            )}
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}
