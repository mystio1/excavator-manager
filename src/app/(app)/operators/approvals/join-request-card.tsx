"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Loader2, UserPlus } from "lucide-react";
import type { PendingJoinRequest } from "@/lib/services/operators";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { Plain } from "@/lib/plain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils/dates";

export type JoinRequestView = Plain<PendingJoinRequest>;

/** One pending "request to join". Approving needs the 6-digit verification code
 * the operator was shown when they asked — it proves the request really came
 * from the person the admin is expecting, not from someone who merely knows the
 * business code and a mobile number. */
export function JoinRequestCard({ request }: { request: JoinRequestView }) {
  const { mutate } = useSWRConfig();
  const [pending, setPending] = useState<"approve" | "decline" | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Set once the server says the request is final (expired / locked / already
  // decided): the card stops accepting input and offers a dismiss instead.
  const [settled, setSettled] = useState(false);

  async function refresh() {
    await Promise.all([mutate("/api/operators"), mutate("/api/approvals")]);
  }

  async function respond(action: "approve" | "decline") {
    setPending(action);
    setError(null);
    try {
      await apiFetch(`/api/operators/join-requests/${request.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "approve" ? { code: code.trim() } : {}),
      });
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        // 422 = wrong code (more attempts may be left); 409/404 = the request is
        // no longer approvable.
        if (err.code === "VALIDATION_FAILED") setCode("");
        else if (err.status === 409 || err.status === 404) setSettled(true);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setPending(null);
    }
  }

  const needsCode = request.requiresCode;
  const codeComplete = /^\d{6}$/.test(code.trim());

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-bold">
              <UserPlus className="size-4 shrink-0 text-primary-text" />
              <span className="truncate">{request.name}</span>
            </p>
            <p className="text-sm text-muted-foreground">{request.mobile}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-xs">
                Requested to join
              </Badge>
              <span className="text-xs text-muted-foreground">Expires {formatDate(request.expiresAt)}</span>
            </div>
            {request.linkedOperator && (
              <p className="mt-1 text-xs text-muted-foreground">
                Will be linked to your existing operator <span className="font-semibold">{request.linkedOperator.name}</span>
                {" "}— their work and salary history carry over.
              </p>
            )}
          </div>
        </div>

        {!settled && needsCode && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`join-code-${request.id}`} className="text-xs font-semibold text-muted-foreground">
              Verification code
            </label>
            <Input
              id={`join-code-${request.id}`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder="6-digit code"
              disabled={pending !== null}
              className="h-11 text-center font-mono text-lg tracking-[0.3em]"
            />
            <p className="text-xs text-muted-foreground">
              Ask {request.name} for the 6-digit code shown on their screen after they requested to join. Only approve
              someone you know.
            </p>
          </div>
        )}
        {!settled && !needsCode && (
          <p className="text-xs text-muted-foreground">
            This request was made before verification codes existed, so no code is needed.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          {settled ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void refresh()}>
              Dismiss
            </Button>
          ) : (
            <>
              <Button type="button" size="sm" variant="secondary" disabled={pending !== null} onClick={() => respond("decline")}>
                {pending === "decline" ? <Loader2 className="size-4 animate-spin" /> : "Decline"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending !== null || (needsCode && !codeComplete)}
                onClick={() => respond("approve")}
              >
                {pending === "approve" ? <Loader2 className="size-4 animate-spin" /> : "Approve"}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
