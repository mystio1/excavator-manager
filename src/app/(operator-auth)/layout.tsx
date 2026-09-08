"use client";

import { useEffect } from "react";
import Image from "next/image";
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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <Image
          src="/login-bg.jpg"
          alt="Excavator background"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/80 to-background/60 backdrop-blur-[2px]" />
        <div className="absolute inset-0 bg-radial-[circle_at_center] from-transparent via-background/30 to-background/80" />
      </div>

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow-primary shadow-lg ring-4 ring-primary/20">
            <ExcavatorLogo className="size-8" />
          </div>
          <div className="text-center">
            <p className="text-xl font-extrabold tracking-tight">
              Operator <span className="text-primary">Portal</span>
            </p>
            <p className="text-sm font-medium text-muted-foreground">Excavator Manager</p>
          </div>
        </div>
        <div className="w-full max-w-sm animate-fade-in-up">{children}</div>
      </div>
    </div>
  );
}
