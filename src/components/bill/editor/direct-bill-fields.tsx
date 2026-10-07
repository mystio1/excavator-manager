"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { Field, MachineOptions, MoneyField } from "./form-parts";
import type { BillFormOptions, DirectFields } from "./types";

/** The fields of a direct bill (hired out by the hour without logged work):
 * machine, period, bucket/breaker hours and rates, transport and the diesel
 * the customer supplied. */
export function DirectBillFields({
  excavators,
  direct,
  transport,
  onChange,
  onTransportChange,
}: {
  excavators: BillFormOptions["excavators"];
  direct: DirectFields;
  transport: string;
  onChange: <K extends keyof DirectFields>(key: K, value: DirectFields[K]) => void;
  onTransportChange: (value: string) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Machine, Period &amp; Hours</h2>
        <Field label="Machine">
          {(id) => (
            <NativeSelect
              id={id}
              value={direct.excavatorId}
              onChange={(e) => onChange("excavatorId", e.target.value)}
              className="h-11 min-w-0"
            >
              <MachineOptions excavators={excavators} />
            </NativeSelect>
          )}
        </Field>
        <div className="@container">
          <div className="grid grid-cols-1 gap-3 @min-[302px]:grid-cols-2">
            <Field label="From Date">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={direct.fromDate}
                  onChange={(e) => onChange("fromDate", e.target.value)}
                  className="h-11 px-2"
                />
              )}
            </Field>
            <Field label="To Date">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={direct.toDate}
                  onChange={(e) => onChange("toDate", e.target.value)}
                  className="h-11 px-2"
                />
              )}
            </Field>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <MoneyField label="Bucket Hours" value={direct.bucketHours} onChange={(v) => onChange("bucketHours", v)} />
          <MoneyField label="Bucket Rate / Hour" value={direct.bucketRate} onChange={(v) => onChange("bucketRate", v)} />
          <MoneyField label="Breaker Hours" value={direct.breakerHours} onChange={(v) => onChange("breakerHours", v)} />
          <MoneyField
            label="Breaker Rate / Hour"
            value={direct.breakerRate}
            onChange={(v) => onChange("breakerRate", v)}
          />
          <MoneyField label="Transport Charges" value={transport} onChange={onTransportChange} className="col-span-2" />
          <MoneyField
            label="Diesel Litres (advance)"
            value={direct.dieselLiters}
            onChange={(v) => onChange("dieselLiters", v)}
          />
          <MoneyField
            label="Diesel Price / Litre"
            value={direct.dieselPricePerLiter}
            onChange={(v) => onChange("dieselPricePerLiter", v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
