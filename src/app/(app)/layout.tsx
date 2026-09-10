"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Snowflake } from "lucide-react";
import { ApiError, swrFetcher } from "@/lib/api-client";
import { useLogout } from "@/lib/use-logout";
import { PIN_UNLOCKED_KEY } from "@/lib/appLock";
import { ExcavatorLogo } from "@/components/excavator-logo";
import { AppLockScreen } from "@/components/app-lock-screen";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/shell/sidebar";
import { BottomNav } from "@/components/shell/bottom-nav";
import { MobileTopBar } from "@/components/shell/mobile-top-bar";
import { DesktopTopHeader } from "@/components/shell/desktop-top-header";

type Alert = { level: "warning" | "danger"; message: string; href: string };
type LayoutData = { businessName: string; ownerName: string; alerts: Alert[]; frozen: boolean; hasPin: boolean };

function FrozenNotice() {
  const { logout, pending } = useLogout();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Snowflake className="size-9" />
      </div>
      <h1 className="text-xl font-bold">Account Temporarily Frozen</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This account has been frozen by our support team. Your data is safe — contact support for recovery.
      </p>
      <Button onClick={logout} disabled={pending} variant="secondary">
        {pending ? "Logging out..." : "Log Out"}
      </Button>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, error } = useSWR<LayoutData>("/api/layout", swrFetcher, {
    // Purely a client-side dedup window (the server computes this fresh on
    // every call, no server-side cache) — just avoids redundant simultaneous
    // requests if multiple components mount against this same SWR key.
    dedupingInterval: 15_000,
    revalidateOnFocus: true,
  });
  // Lazy-init from sessionStorage — safe even though it runs on first
  // render, because the "!data" branch below shows the same Loading state
  // regardless of this value until the client-side fetch actually resolves.
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(PIN_UNLOCKED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace("/login");
    }
  }, [error, router]);

  if (!data) {
    // First paint of the whole app shell — distinct from (app)/loading.tsx,
    // which only covers content swapping once this shell already exists.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ExcavatorLogo animated className="size-9" />
        </div>
      </div>
    );
  }

  if (data.frozen) {
    return <FrozenNotice />;
  }

  if (data.hasPin && !unlocked) {
    return (
      <AppLockScreen
        onUnlocked={() => {
          try {
            sessionStorage.setItem(PIN_UNLOCKED_KEY, "1");
          } catch {
            // Private-browsing/storage-blocked — falls back to asking again
            // next render, same as if nothing had been saved at all.
          }
          setUnlocked(true);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar businessName={data.businessName} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <MobileTopBar businessName={data.businessName} alerts={data.alerts} />
        <DesktopTopHeader ownerName={data.ownerName} alerts={data.alerts} />
        <main className="flex-1 overflow-x-hidden bg-background pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
