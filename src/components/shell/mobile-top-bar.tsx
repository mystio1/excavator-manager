"use client";

import Link from "next/link";
import { LogOut, Search, Settings } from "lucide-react";
import { useLogout } from "@/lib/use-logout";
import { ExcavatorLogo } from "@/components/excavator-logo";
import { NotificationBell } from "@/components/shell/notification-bell";

type Alert = { level: "warning" | "danger"; message: string; href: string };

export function MobileTopBar({ businessName, alerts }: { businessName: string; alerts: Alert[] }) {
  const { logout, pending } = useLogout();

  return (
    <header className="app-topbar flex items-center justify-between border-b border-header-border px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] md:hidden">
      <div className="flex min-w-0 items-center gap-2 font-bold">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ExcavatorLogo className="size-4" />
        </div>
        <span className="truncate">{businessName}</span>
      </div>
      <div className="flex items-center gap-0.5">
        <Link href="/search" aria-label="Search" className="p-2 text-muted-foreground">
          <Search className="size-5" />
        </Link>
        <NotificationBell alerts={alerts} />
        <Link href="/settings" aria-label="Settings" className="p-2 text-muted-foreground">
          <Settings className="size-5" />
        </Link>
        <button type="button" disabled={pending} onClick={logout} aria-label="Log out" className="p-2 text-muted-foreground disabled:opacity-60">
          <LogOut className="size-5" />
        </button>
      </div>
    </header>
  );
}
