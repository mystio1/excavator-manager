"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULES_HINT } from "@/lib/password-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch("/api/auth/reset-password", { method: "POST", body: JSON.stringify(body) });
    router.push("/login?reset=1");
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await run({
      token,
      password: fd.get("password"),
      confirmPassword: fd.get("confirmPassword"),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={1} className="text-2xl">
          Set a New Password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-base">
              New Password
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              aria-describedby="password-rules"
              className="h-12 text-base"
              autoFocus
            />
            <p id="password-rules" className="text-xs text-muted-foreground">
              {PASSWORD_RULES_HINT}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword" className="text-base">
              Confirm New Password
            </Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              className="h-12 text-base"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
              {error.includes("expired") && (
                <>
                  {" "}
                  <Link href="/forgot-password" className="underline underline-offset-4">
                    Request a new link
                  </Link>
                </>
              )}
            </p>
          )}
          <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
            {pending ? "Saving..." : "Reset Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
