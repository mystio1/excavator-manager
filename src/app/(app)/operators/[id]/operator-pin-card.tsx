"use client";

import { useActionState, useState } from "react";
import { setOperatorPinAction } from "../actions";
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
  const [state, formAction, isPending] = useActionState(setOperatorPinAction, undefined);
  // A pending join request (self-signed-up, not yet approved) already has a
  // PIN — pre-check the box so Save doubles as one-click Approve.
  const joinPending = !canLogin && hasPinSet;
  const [enabled, setEnabled] = useState(canLogin || joinPending);

  return (
    <Card>
      <CardContent>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-muted-foreground">Operator Portal Login</p>
          {(canLogin || joinPending) && (
            <Badge
              className={
                canLogin && hasPinSet
                  ? "bg-working text-working-foreground"
                  : joinPending
                    ? "bg-primary text-primary-foreground"
                    : "bg-idle text-idle-foreground"
              }
            >
              {canLogin && hasPinSet ? "Active" : joinPending ? "Requested to join" : "Awaiting activation"}
            </Badge>
          )}
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          {joinPending
            ? "This operator requested to join using the business code and already set a PIN — approve to let them log in."
            : "Operators log in with their mobile number and a PIN — no email needed."}
        </p>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="operatorId" value={operatorId} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="canLogin"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="size-4"
            />
            {joinPending ? "Approve portal login for this operator" : "Enable portal login for this operator"}
          </label>

          {enabled && (
            <div className="flex flex-col gap-2">
              <Label className="text-sm">{hasPinSet ? "Reset PIN" : "Set PIN"} (4-6 digits, optional)</Label>
              <Input name="pin" type="password" inputMode="numeric" placeholder="1234" className="h-11" />
              <p className="text-xs text-muted-foreground">
                {joinPending
                  ? "Leave blank to keep the PIN they already chose when requesting to join."
                  : hasPinSet
                    ? "Leave blank to keep their current PIN."
                    : "Leave blank and the operator can request to join at /operator-signup using this mobile number."}
              </p>
            </div>
          )}

          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}

          <Button type="submit" size="sm" variant="secondary" className="self-start" disabled={isPending}>
            {isPending ? "Saving..." : joinPending ? "Approve" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
