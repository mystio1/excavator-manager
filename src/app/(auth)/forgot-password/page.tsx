"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, undefined);

  if (state?.submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Check Your Email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            If that email is registered, we&rsquo;ve sent a link to reset your password. It&rsquo;s valid for 1 hour.
          </p>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary underline underline-offset-4">
              Back to log in
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Forgot Password</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Enter the email you use to log in and we&rsquo;ll send you a link to reset your password.
        </p>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-base">
              Email
            </Label>
            <Input id="email" name="email" type="email" required className="h-12 text-base" autoFocus />
          </div>
          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
          <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending}>
            {isPending ? "Sending..." : "Send Reset Link"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary underline underline-offset-4">
            Back to log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
