import Link from "next/link";
import { LogOut, Search, Settings } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import { ExcavatorLogo } from "@/components/excavator-logo";
import { NotificationBell } from "@/components/shell/notification-bell";

type Alert = { level: "warning" | "danger"; message: string; href: string };

export function MobileTopBar({ businessName, alerts }: { businessName: string; alerts: Alert[] }) {
  return (
    <header className="app-topbar flex items-center justify-between border-b border-header-border px-4 py-3 md:hidden">
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
        <form action={logoutAction}>
          <button type="submit" aria-label="Log out" className="p-2 text-muted-foreground">
            <LogOut className="size-5" />
          </button>
        </form>
      </div>
    </header>
  );
}
