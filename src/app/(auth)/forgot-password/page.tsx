"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const { error, pending, run } = useApiForm(async (email: string) => {
    await apiFetch("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
    setSubmitted(true);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get("email") as string;
    await run(email);
  }

  if (submitted) {
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
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-base">
              Email
            </Label>
            <Input id="email" name="email" type="email" required className="h-12 text-base" autoFocus />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
            {pending ? "Sending..." : "Send Reset Link"}
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
