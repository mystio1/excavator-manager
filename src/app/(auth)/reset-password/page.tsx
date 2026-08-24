"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Invalid Link</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This password reset link is missing its token. Request a new one below.
          </p>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/forgot-password" className="font-medium text-primary underline underline-offset-4">
              Request a new link
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return <ResetPasswordForm token={token} />;
}
