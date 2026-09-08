"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { LockKeyhole } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Optional per-device re-unlock PIN — layered on top of the real login,
 * not a replacement for it (see app-lock-screen.tsx and /api/auth/verify-pin
 * for the other half of this). Settings only ever proves a currentPin to
 * change or disable one that's already set; setting the first one needs
 * nothing beyond already being signed into Settings. */
export function AppLockSection({ hasPin }: { hasPin: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">App Lock PIN</CardTitle>
        {hasPin && <Badge className="bg-working text-working-foreground">Enabled</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {hasPin
            ? "This device asks for your PIN before showing the dashboard, on top of your normal login."
            : "Optional — require a PIN on this device before the dashboard opens, on top of your normal login."}
        </p>
        <div className="flex flex-wrap gap-2">
          {hasPin ? (
            <>
              <ChangePinDialog />
              <DisablePinDialog />
            </>
          ) : (
            <SetPinDialog />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SetPinDialog() {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch("/api/settings/app-pin", { method: "POST", body: JSON.stringify(body) });
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({ newPin: fd.get("newPin"), confirmPin: fd.get("confirmPin") });
    if (ok) {
      setOpen(false);
      await Promise.all([mutate("/api/settings"), mutate("/api/layout")]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <LockKeyhole className="size-4" />
        Set PIN
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set App Lock PIN</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">New PIN (4 or 6 digits)</Label>
            <Input name="newPin" type="password" inputMode="numeric" required autoFocus className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Confirm PIN</Label>
            <Input name="confirmPin" type="password" inputMode="numeric" required className="h-11" />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Set PIN"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChangePinDialog() {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch("/api/settings/app-pin", { method: "POST", body: JSON.stringify(body) });
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      currentPin: fd.get("currentPin"),
      newPin: fd.get("newPin"),
      confirmPin: fd.get("confirmPin"),
    });
    if (ok) {
      setOpen(false);
      await Promise.all([mutate("/api/settings"), mutate("/api/layout")]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="secondary" />}>Change PIN</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change App Lock PIN</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Current PIN</Label>
            <Input name="currentPin" type="password" inputMode="numeric" required autoFocus className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-sm">New PIN (4 or 6 digits)</Label>
            <Input name="newPin" type="password" inputMode="numeric" required className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Confirm New PIN</Label>
            <Input name="confirmPin" type="password" inputMode="numeric" required className="h-11" />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Change PIN"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DisablePinDialog() {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch("/api/settings/app-pin", { method: "DELETE", body: JSON.stringify(body) });
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({ currentPin: fd.get("currentPin") });
    if (ok) {
      setOpen(false);
      await Promise.all([mutate("/api/settings"), mutate("/api/layout")]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" />}
      >
        Disable
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disable App Lock PIN?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This device will go straight to the dashboard on open, same as before you set a PIN.
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Current PIN</Label>
            <Input name="currentPin" type="password" inputMode="numeric" required autoFocus className="h-11" />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Disabling..." : "Disable"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
