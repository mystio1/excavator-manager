"use client";

import { Card, CardContent } from "@/components/ui/card";
import { MoneyField } from "./form-parts";
import type { BillFields } from "./types";

type ChargeKey = "transport" | "fuel" | "extra" | "bucket" | "breaker" | "discount";

/** Transport, fuel, extra and discount. Bucket/breaker charges only exist on
 * older bills, so those two fields appear only when the bill being edited had
 * them (`legacy`). */
export function ExtraCharges({
  fields,
  legacy,
  onChange,
}: {
  fields: Pick<BillFields, ChargeKey>;
  legacy: { bucket: boolean; breaker: boolean };
  onChange: (key: ChargeKey, value: string) => void;
}) {
  return (
    <Card>
      <CardContent className="@container flex flex-col gap-4">
        <h2 className="text-base font-semibold">Extra Charges</h2>
        <div className="grid grid-cols-2 gap-4 @min-[480px]:grid-cols-3">
          <MoneyField label="Transport" value={fields.transport} onChange={(v) => onChange("transport", v)} />
          <MoneyField label="Fuel" value={fields.fuel} onChange={(v) => onChange("fuel", v)} />
          <MoneyField label="Extra" value={fields.extra} onChange={(v) => onChange("extra", v)} />
          {legacy.bucket && (
            <MoneyField label="Bucket Charge" value={fields.bucket} onChange={(v) => onChange("bucket", v)} />
          )}
          {legacy.breaker && (
            <MoneyField label="Breaker Charge" value={fields.breaker} onChange={(v) => onChange("breaker", v)} />
          )}
          <MoneyField label="Discount" value={fields.discount} onChange={(v) => onChange("discount", v)} />
        </div>
      </CardContent>
    </Card>
  );
}
