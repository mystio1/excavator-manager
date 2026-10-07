"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function OperatorPinCard({
  operatorId,
  canLogin,
  hasPinSet,
}: {
  operatorId: string;
  canLogin: boolean;
  hasPinSet: boolean;
}) {
  const { mutate } = useSWRConfig();
  const [enabled, setEnabled] = useState(canLogin);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch(`/api/operators/${operatorId}/pin`, { method: "PATCH", body: JSON.stringify(body) });
    await mutate((key) => typeof key === "string" && key.startsWith("/api/operators/detail"));
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await run({ canLogin: fd.get("canLogin") === "on", pin: fd.get("pin") || undefined });
  }

  return (
    <Card>
      <CardContent>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-muted-foreground">Operator Portal Login</p>
          {canLogin && (
            <Badge className={hasPinSet ? "bg-working text-working-foreground" : "bg-idle text-idle-foreground"}>
              {hasPinSet ? "Active" : "Awaiting activation"}
            </Badge>
          )}
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Operators log in with their mobile number and a PIN — no email needed. Operators who ask to join with the
          business code appear under pending approvals, where you approve them with the code they were shown.
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="canLogin"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="size-4"
            />
            Enable portal login for this operator
          </label>

          {enabled && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="pin" className="text-sm">{hasPinSet ? "Reset PIN" : "Set PIN"} (4-8 digits, optional)</Label>
              <Input id="pin" name="pin" type="password" inputMode="numeric" maxLength={8} autoComplete="new-password" placeholder="1234" className="h-11" />
              <p className="text-xs text-muted-foreground">
                {hasPinSet
                  ? "Leave blank to keep their current PIN. Resetting it signs them out everywhere."
                  : "Leave blank and the operator can request to join at /operator-signup using this mobile number."}
              </p>
            </div>
          )}
          {!enabled && hasPinSet && (
            <p className="text-xs text-muted-foreground">
              Saving with this unchecked turns off portal login, removes the PIN and signs the operator out everywhere.
            </p>
          )}

          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

          <Button type="submit" size="sm" variant="secondary" className="self-start" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
