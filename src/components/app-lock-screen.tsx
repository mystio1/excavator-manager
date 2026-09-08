"use client";

import { LockKeyhole } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { useLogout } from "@/lib/use-logout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExcavatorLogo } from "@/components/excavator-logo";

/** Shown by (app)/layout.tsx on a fresh app open when the owner has set an
 * app-lock PIN — gates what's rendered client-side, not a second login. The
 * session behind it is already valid; verify-pin only decides whether to
 * reveal the dashboard. "Forgot PIN? Log out" is the escape hatch — logging
 * out and back in with the real password is always available regardless of
 * the PIN, same as any lock screen on a phone. */
export function AppLockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const { logout, pending: loggingOut } = useLogout();
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch("/api/auth/verify-pin", { method: "POST", body: JSON.stringify(body) });
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({ pin: fd.get("pin") });
    if (ok) onUnlocked();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <ExcavatorLogo className="size-9" />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <LockKeyhole className="size-5 text-primary" />
            Enter PIN
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pin" className="text-base">
                PIN
              </Label>
              <Input
                id="pin"
                name="pin"
                type="password"
                inputMode="numeric"
                required
                autoFocus
                className="h-12 text-base"
              />
            </div>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
              {pending ? "Checking..." : "Unlock"}
            </Button>
          </form>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="mt-4 w-full text-center text-sm font-medium text-muted-foreground underline underline-offset-4"
          >
            {loggingOut ? "Logging out..." : "Forgot PIN? Log out"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
