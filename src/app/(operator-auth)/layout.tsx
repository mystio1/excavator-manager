"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ExcavatorLogo } from "@/components/excavator-logo";

export default function OperatorAuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    // Checks the operator is still active, not just that a session cookie is
    // present — see (auth)/layout.tsx's identical reasoning for why this
    // can't be a stale-JWT check alone.
    apiFetch("/api/operator/layout")
      .then(() => router.replace("/operator"))
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
            Operator <span className="text-primary">Portal</span>
          </p>
          <p className="text-sm text-muted-foreground">Excavator Manager</p>
        </div>
      </div>
      <div className="w-full max-w-sm animate-fade-in-up">{children}</div>
    </div>
  );
}
