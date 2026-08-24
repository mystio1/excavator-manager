"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ApiError, swrFetcher } from "@/lib/api-client";
import { ExcavatorLogo } from "@/components/excavator-logo";
import { Sidebar } from "@/components/shell/sidebar";
import { BottomNav } from "@/components/shell/bottom-nav";
import { MobileTopBar } from "@/components/shell/mobile-top-bar";
import { DesktopTopHeader } from "@/components/shell/desktop-top-header";

type Alert = { level: "warning" | "danger"; message: string; href: string };
type LayoutData = { businessName: string; ownerName: string; alerts: Alert[] };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, error } = useSWR<LayoutData>("/api/layout", swrFetcher, {
    // Same freshness window as the server's own unstable_cache on getAlerts
    // — no point re-fetching the shell more often than the data actually
    // changes underneath it.
    dedupingInterval: 15_000,
    revalidateOnFocus: true,
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
