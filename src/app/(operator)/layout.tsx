"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { ApiError, swrFetcher } from "@/lib/api-client";
import { useLogout } from "@/lib/use-logout";
import { ExcavatorLogo } from "@/components/excavator-logo";
import { Button } from "@/components/ui/button";
import { ThemeToggleButton } from "@/components/theme-toggle-button";

type LayoutData = { operatorName: string };

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, error } = useSWR<LayoutData>("/api/operator/layout", swrFetcher);
  const { logout, pending } = useLogout("/operator-login");

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace("/operator-login");
    }
  }, [error, router]);

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ExcavatorLogo animated className="size-9" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)]">
        <Link href="/operator" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ExcavatorLogo className="size-5" />
          </div>
          <span className="font-bold">{data.operatorName}</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggleButton />
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Log out" onClick={logout} disabled={pending}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>
      <main className="flex-1 bg-background pb-8">{children}</main>
    </div>
  );
}
