"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(resetPasswordAction, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Set a New Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-base">
              New Password
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              className="h-12 text-base"
              autoFocus
            />
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
              minLength={6}
              className="h-12 text-base"
            />
          </div>
          {state?.error && (
            <p className="text-sm font-medium text-destructive">
              {state.error}
              {state.error.includes("expired") && (
                <>
                  {" "}
                  <Link href="/forgot-password" className="underline underline-offset-4">
                    Request a new link
                  </Link>
                </>
              )}
            </p>
          )}
          <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending}>
            {isPending ? "Saving..." : "Reset Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
