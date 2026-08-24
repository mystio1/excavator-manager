"use client";

import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/shell/notification-bell";
import { useLogout } from "@/lib/use-logout";

type Alert = { level: "warning" | "danger"; message: string; href: string };

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function DesktopTopHeader({
  ownerName,
  alerts,
}: {
  ownerName: string;
  alerts: Alert[];
}) {
  const { logout, pending } = useLogout();

  return (
    <header className="app-topbar hidden h-16 shrink-0 items-center gap-4 border-b border-header-border px-6 md:flex">
      <form action="/search" method="get" className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          placeholder="Search machines, customers, operators..."
          className="h-10 rounded-lg border-transparent bg-white/55 pl-9 focus-visible:border-ring focus-visible:bg-card dark:bg-black/20"
        />
      </form>

      <div className="flex items-center gap-1.5">
        <ThemeToggleButton />

        <NotificationBell alerts={alerts} />

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg py-1.5 pr-2 pl-1.5 transition-colors hover:bg-accent">
            <div className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {initials(ownerName) || "U"}
            </div>
            <span className="max-w-28 truncate text-sm font-medium">{ownerName}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-44">
            <DropdownMenuItem render={<Link href="/settings" />}>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <button
              type="button"
              disabled={pending}
              onClick={logout}
              className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-destructive select-none hover:bg-destructive/10 disabled:opacity-60"
            >
              Log Out
            </button>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
