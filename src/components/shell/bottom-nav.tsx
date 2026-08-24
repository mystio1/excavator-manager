"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavItemActive, NAV_ITEMS } from "./nav-items";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

// Only a handful of tabs comfortably fit a bottom nav on narrow phones (an
// icon+label item needs ~55-65px of breathing room before it's forced to
// wrap or spill past the viewport edge — 8 items never fits under ~430px).
// The rest live behind "More" instead, same destinations, still one tap away.
const PRIMARY_HREFS = ["/dashboard", "/excavators", "/bills", "/operators"];

export function BottomNav() {
  const pathname = usePathname();
  const primaryItems = PRIMARY_HREFS.map((href) => NAV_ITEMS.find((i) => i.href === href)!);
  const secondaryItems = NAV_ITEMS.filter((i) => !PRIMARY_HREFS.includes(i.href));
  const moreActive = secondaryItems.some((i) => isNavItemActive(pathname, i.href));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card pb-[max(env(safe-area-inset-bottom),0px)] md:hidden">
      {primaryItems.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-6 shrink-0" />
            <span className="truncate px-1">{item.label}</span>
          </Link>
        );
      })}

      <Sheet>
        <SheetTrigger
          render={
            <button
              type="button"
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                moreActive ? "text-primary" : "text-muted-foreground",
              )}
            />
          }
        >
          <MoreHorizontal className="size-6 shrink-0" />
          <span className="truncate px-1">More</span>
        </SheetTrigger>
        <SheetContent side="bottom" className="pb-[max(env(safe-area-inset-bottom),1rem)]">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4 pb-2">
            {secondaryItems.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium",
                    active ? "border-primary/40 bg-primary/10 text-primary" : "border-transparent text-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
