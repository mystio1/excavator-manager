"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ExcavatorLogo } from "@/components/excavator-logo";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Same session check (auth)/layout.tsx uses — role-gated (OWNER only),
    // so an operator session correctly falls through to /login here rather
    // than bouncing off /dashboard first, same as visiting "/" signed out.
    apiFetch("/api/layout")
      .then(() => router.replace("/dashboard"))
      .catch((err) => {
        router.replace("/login");
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error("Session check failed:", err);
        }
      });
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <ExcavatorLogo animated className="size-9" />
      </div>
    </div>
  );
}
