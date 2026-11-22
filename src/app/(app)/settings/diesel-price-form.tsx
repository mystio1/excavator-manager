"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** What a litre of diesel costs — the dashboard's profit uses it to cost the diesel litres
 * recorded on work, for any machine with no actual diesel purchase recorded. */
export function DieselPriceForm({ dieselPricePerLitre }: { dieselPricePerLitre: number | null }) {
  const { mutate } = useSWRConfig();
  const [value, setValue] = useState(dieselPricePerLitre != null ? String(dieselPricePerLitre) : "");
  const [success, setSuccess] = useState(false);
  const { error, pending, run } = useApiForm(async (price: number | null) => {
    await apiFetch("/api/settings/diesel-price", {
      method: "PATCH",
      body: JSON.stringify({ dieselPricePerLitre: price }),
    });
    await mutate((key) => typeof key === "string" && (key === "/api/settings" || key.startsWith("/api/dashboard")));
    setSuccess(true);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSuccess(false);
    await run(value.trim() === "" ? null : Number(value));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Diesel Price</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          What one litre of diesel costs you. The dashboard&rsquo;s profit uses it to cost the diesel litres recorded on
          work — except for a machine where you have recorded actual diesel purchases (Expenses), which are used
          instead.
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex max-w-xs flex-col gap-2">
            <Label htmlFor="dieselPricePerLitre">Price per litre (₹)</Label>
            <Input
              id="dieselPricePerLitre"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="e.g. 92.50"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-11"
            />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          {success && !error && <p role="status" className="text-sm font-medium text-working">Saved.</p>}
          <Button type="submit" size="lg" className="h-11 self-start" disabled={pending}>
            {pending ? "Saving..." : "Save Diesel Price"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
