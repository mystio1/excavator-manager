"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavItemActive, NAV_ITEMS } from "./nav-items";
import { useLogout } from "@/lib/use-logout";
import { ExcavatorLogo } from "@/components/excavator-logo";

const COLLAPSE_KEY = "excavator-sidebar-collapsed";

export function Sidebar({ businessName }: { businessName: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { logout, pending } = useLogout();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a browser-only API unavailable during SSR
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar transition-[width] duration-250 ease-out md:flex",
        collapsed ? "w-[76px]" : "w-64",
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-golden text-primary-foreground shadow-glow-primary">
          <ExcavatorLogo className="size-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0 animate-fade-in">
            <p className="truncate text-[15px] leading-tight font-extrabold text-sidebar-foreground">
              Excavator <span className="text-primary">Manager</span>
            </p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">Smart Fleet Management</p>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="truncate border-b border-sidebar-border px-4 py-2.5 text-sm font-medium text-muted-foreground">
          {businessName}
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl border-l-[3px] px-3 py-2.5 text-[15px] font-medium transition-all duration-200",
                collapsed && "justify-center",
                active
                  ? "border-l-primary bg-primary/10 text-primary"
                  : "border-l-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Link
          href="/settings"
          title={collapsed ? "Settings" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-xl border-l-[3px] px-3 py-2.5 text-[15px] font-medium transition-all duration-200",
            collapsed && "justify-center",
            pathname.startsWith("/settings")
              ? "border-l-primary bg-primary/10 text-primary"
              : "border-l-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <Settings className="size-5 shrink-0" />
          {!collapsed && "Settings"}
        </Link>
      </div>

      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          disabled={pending}
          onClick={logout}
          title={collapsed ? "Log Out" : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-60",
            collapsed && "justify-center",
          )}
        >
          <LogOut className="size-5 shrink-0" />
          {!collapsed && "Log Out"}
        </button>
      </div>

      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="flex items-center justify-center gap-2 border-t border-sidebar-border py-2.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <ChevronsLeft className={cn("size-4 transition-transform duration-250", collapsed && "rotate-180")} />
        {!collapsed && <span className="text-xs font-medium">Collapse</span>}
      </button>
    </aside>
  );
}
