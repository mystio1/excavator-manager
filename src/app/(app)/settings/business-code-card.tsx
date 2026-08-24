"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { regenerateBusinessCodeAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function BusinessCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [state, formAction, isPending] = useActionState(regenerateBusinessCodeAction, undefined);
  const [open, setOpen] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail (permissions, non-secure context) — the
      // code is still visible on screen to copy by hand.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Business Code</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Share this code with your operators — they enter it at <span className="font-medium">/operator-signup</span> to
          set up their own account under this business.
        </p>
        <div className="flex items-center gap-2">
          <p className="rounded-lg border border-dashed bg-muted/50 px-4 py-3 font-mono text-2xl font-bold tracking-[0.3em]">
            {code}
          </p>
          <Button type="button" size="icon" variant="secondary" onClick={handleCopy} aria-label="Copy code">
            {copied ? <Check className="size-4 text-working" /> : <Copy className="size-4" />}
          </Button>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button type="button" size="sm" variant="ghost" className="self-start" />}>
            <RefreshCw className="size-4" />
            Regenerate Code
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Regenerate Business Code?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              The current code stops working immediately. Anyone mid-signup with the old code will need the new one.
            </p>
            <form action={formAction} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="customCode" className="text-sm">
                  New Code (Optional)
                </Label>
                <Input
                  id="customCode"
                  name="customCode"
                  placeholder="Leave blank to auto-generate"
                  maxLength={20}
                  className="h-11 uppercase"
                />
              </div>
              {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
              <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
                <Button type="submit" variant="destructive" size="lg" className="h-11 w-full" disabled={isPending}>
                  {isPending ? "Regenerating..." : "Yes, Regenerate"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
