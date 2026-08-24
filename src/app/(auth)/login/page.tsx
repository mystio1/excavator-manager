"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, undefined);
  const searchParams = useSearchParams();
  const justReset = searchParams.get("reset") === "1";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Log In</CardTitle>
      </CardHeader>
      <CardContent>
        {justReset && (
          <p className="mb-4 rounded-lg bg-working/12 px-3 py-2 text-sm font-medium text-working">
            Password reset — log in with your new password.
          </p>
        )}
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-base">
              Email
            </Label>
            <Input id="email" name="email" type="email" required className="h-12 text-base" autoFocus />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-base">
                Password
              </Label>
              <Link href="/forgot-password" className="text-sm font-medium text-primary underline underline-offset-4">
                Forgot password?
              </Link>
            </div>
            <Input id="password" name="password" type="password" required className="h-12 text-base" />
          </div>
          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
          <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending}>
            {isPending ? "Logging in..." : "Log In"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/register" className="font-medium text-primary underline underline-offset-4">
            Create your business account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
