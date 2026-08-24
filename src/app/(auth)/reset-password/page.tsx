import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

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
