"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ExcavatorLogo } from "@/components/excavator-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    // Checks the business still exists, not just that a session cookie is
    // present — otherwise a stale session (JWT valid, business gone) would
    // bounce here from /login and get redirected straight back to
    // /dashboard, which redirects back to /login: an infinite loop.
    apiFetch("/api/layout")
      .then(() => router.replace("/dashboard"))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error("Session check failed:", err);
        }
      });
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow-primary">
          <ExcavatorLogo className="size-8" />
        </div>
        <div className="text-center">
          <p className="text-xl font-extrabold">
            Excavator <span className="text-primary">Manager</span>
          </p>
          <p className="text-sm text-muted-foreground">Smart Fleet Management</p>
        </div>
      </div>
      <div className="w-full max-w-sm animate-fade-in-up">{children}</div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Are you an operator?{" "}
        <Link href="/operator-login" className="font-medium text-primary underline underline-offset-4">
          Log in here
        </Link>
      </p>
    </div>
  );
}
