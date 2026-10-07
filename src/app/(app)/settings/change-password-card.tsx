"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Signed-in password change. The server signs every OTHER device out (session
 * revocation) and keeps this one signed in; if it could not re-issue this
 * device's session it asks to log in again. */
export function ChangePasswordCard() {
  const [done, setDone] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    const result = await apiFetch<{ ok: true; reauthRequired?: boolean }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (result.reauthRequired) {
      // Full reload on purpose (not router.push): the old session cookie is no
      // longer valid, so every cached SWR entry and layout state must be dropped.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setDone(false);
    const newPassword = String(fd.get("newPassword") ?? "");
    const confirmed = newPassword === String(fd.get("confirmPassword") ?? "");
    setMismatch(!confirmed);
    if (!confirmed) return;
    const ok = await run({ currentPassword: fd.get("currentPassword"), newPassword });
    if (ok) {
      form.reset();
      setDone(true);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <KeyRound className="size-5 text-primary-text" aria-hidden="true" />
        <CardTitle className="text-base">Change Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            At least 8 characters with a letter and a number. Changing it signs you out of your other devices.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required className="h-11" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={8} className="h-11" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required className="h-11" />
          </div>
          {(mismatch || error) && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {mismatch ? "Passwords don't match" : error}
            </p>
          )}
          {done && (
            <p role="status" className="text-sm font-medium text-working">
              Password changed. Your other devices have been signed out.
            </p>
          )}
          <Button type="submit" disabled={pending} className="h-11 self-start">
            {pending ? "Saving..." : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
