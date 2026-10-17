"use client";

import useSWR, { SWRConfig } from "swr";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { LogOut, Snowflake } from "lucide-react";
import { ApiError, swrFetcher } from "@/lib/api-client";
import { useLogout } from "@/lib/use-logout";
import { ExcavatorLogo } from "@/components/excavator-logo";
import { Button } from "@/components/ui/button";
import { ThemeToggleButton } from "@/components/theme-toggle-button";

type LayoutData = { operatorName: string; frozen: boolean };

/**
 * The operator is looking at a screen the admin can change underneath them — a
 * reading corrected or deleted, diesel adjusted, a job stopped — and they have
 * no reason to think to reload. So every fetch in the portal re-checks on a
 * short interval.
 *
 * SWR pauses this while the tab or app is in the background (refreshWhenHidden
 * is off by default), so a phone in a pocket costs nothing, and revalidates the
 * moment it comes back to the foreground.
 */
const LIVE_REFRESH = { refreshInterval: 10_000, revalidateOnFocus: true } as const;

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // The layout's own fetch sits outside the provider below, so it takes the
  // same options directly — a frozen account must reach the operator too.
  const { data, error } = useSWR<LayoutData>("/api/operator/layout", swrFetcher, LIVE_REFRESH);
  const { logout, pending } = useLogout("/operator-login");

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace("/operator-login");
    }
  }, [error, router]);

  if (!data) {
    return (
      <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary-text">
          <ExcavatorLogo animated className="size-9" />
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (data.frozen) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary-text">
          <Snowflake className="size-9" />
        </div>
        <h1 className="text-xl font-bold">Account Temporarily Frozen</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This account has been frozen by our support team. Your data is safe — contact support for recovery.
        </p>
        <Button onClick={logout} disabled={pending} variant="secondary">
          {pending ? "Logging out..." : "Log Out"}
        </Button>
      </main>
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
      <main className="flex-1 bg-background pb-8">
        <SWRConfig value={LIVE_REFRESH}>{children}</SWRConfig>
      </main>
    </div>
  );
}
