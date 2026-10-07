"use client";

import { LogOut } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { PIN_UNLOCKED_KEY } from "@/lib/appLock";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Ends every session of this account on every device (lost phone, shared
 * device) without changing the password. This device is signed out too. */
export function SignOutEverywhereCard() {
  const { error, pending, run } = useApiForm(async () => {
    await apiFetch("/api/auth/sign-out-everywhere", { method: "POST" });
    try {
      sessionStorage.removeItem(PIN_UNLOCKED_KEY);
    } catch {
      // Storage blocked — nothing to clear.
    }
    // Full reload on purpose (not router.push): every cached SWR entry must be dropped.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <LogOut className="size-5 text-primary-text" aria-hidden="true" />
        <CardTitle className="text-base">Sign Out Everywhere</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Lost a phone or used a shared device? This signs you out on every device, including this one. You can log in again
          afterwards.
        </p>
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Sign out of all devices, including this one?")) void run({});
          }}
          className="h-11 self-start"
        >
          {pending ? "Signing out..." : "Sign out of all devices"}
        </Button>
      </CardContent>
    </Card>
  );
}
