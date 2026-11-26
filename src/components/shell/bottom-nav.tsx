"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavItemActive, NAV_ITEMS } from "./nav-items";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// Only a handful of tabs comfortably fit a bottom nav on narrow phones (an
// icon+label item needs ~55-65px of breathing room before it's forced to
// wrap or spill past the viewport edge — 8 items never fits under ~430px).
// The rest live behind "More" instead, same destinations, still one tap away.
const PRIMARY_HREFS = ["/dashboard", "/excavators", "/bills", "/operators"];
const SLOTS = PRIMARY_HREFS.length + 1; // + More

/** Movement (px) before a touch on the bar counts as a slide rather than a tap. */
const DRAG_THRESHOLD = 8;

/**
 * Floating glass tab bar. Tapping a tab slides the highlight to it straight away; sliding a finger
 * along the bar turns the highlight into a magnifying lens that follows it, and letting go opens
 * the tab underneath (More opens its sheet).
 */
export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const primaryItems = PRIMARY_HREFS.map((href) => NAV_ITEMS.find((i) => i.href === href)!);
  const secondaryItems = NAV_ITEMS.filter((i) => !PRIMARY_HREFS.includes(i.href));
  const moreActive = secondaryItems.some((i) => isNavItemActive(pathname, i.href));
  const routeIndex = moreActive ? SLOTS - 1 : primaryItems.findIndex((i) => isNavItemActive(pathname, i.href));

  const trackRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; startX: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  /** The lens while a finger is sliding: its left edge (px) and the tab under it; null otherwise. */
  const [lens, setLens] = useState<{ left: number; index: number } | null>(null);
  const lensLeft = lens?.left ?? null;
  /** A tab chosen but not yet navigated to — the highlight moves immediately. */
  const [pending, setPending] = useState<{ index: number; from: string } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const lensIndex = lens?.index ?? null;
  const shownIndex = lensIndex ?? (pending && pending.from === pathname ? pending.index : routeIndex);

  function open(index: number) {
    if (index === SLOTS - 1) {
      setMoreOpen(true);
      return;
    }
    const item = primaryItems[index];
    if (!isNavItemActive(pathname, item.href)) {
      setPending({ index, from: pathname });
      router.push(item.href);
    }
  }

  function lensAt(clientX: number) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const w = rect.width / SLOTS;
    const left = Math.max(0, Math.min(rect.width - w, clientX - rect.left - w / 2));
    const index = Math.max(0, Math.min(SLOTS - 1, Math.round(left / w)));
    // A tiny tick as the lens crosses into another tab (where the phone supports it).
    if (lens && lens.index !== index) navigator.vibrate?.(6);
    setLens({ left, index });
  }

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] lg:hidden"
    >
      <div className="glass-bar pointer-events-auto mx-auto max-w-lg rounded-full p-1.5">
        <div
          ref={trackRef}
          className="relative grid touch-none select-none"
          style={{ gridTemplateColumns: `repeat(${SLOTS}, minmax(0, 1fr))` }}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            gesture.current = { id: e.pointerId, startX: e.clientX, moved: false };
          }}
          onPointerMove={(e) => {
            const g = gesture.current;
            if (!g || g.id !== e.pointerId) return;
            if (!g.moved) {
              if (Math.abs(e.clientX - g.startX) < DRAG_THRESHOLD) return;
              g.moved = true;
              e.currentTarget.setPointerCapture(e.pointerId);
            }
            lensAt(e.clientX);
          }}
          onPointerUp={() => {
            const g = gesture.current;
            gesture.current = null;
            if (!g || !g.moved) return;
            // The release ends a slide, not a tap: the link under the finger must not also fire.
            suppressClick.current = true;
            setTimeout(() => (suppressClick.current = false), 0);
            const index = lensIndex ?? routeIndex;
            setLens(null);
            if (index >= 0) open(index);
          }}
          onPointerCancel={() => {
            gesture.current = null;
            setLens(null);
          }}
        >
          {shownIndex >= 0 && (
            <span
              aria-hidden
              className={cn("glass-pill absolute inset-y-0 left-0 rounded-full", lensLeft != null && "glass-lens")}
              style={{
                width: `${100 / SLOTS}%`,
                transform:
                  lensLeft != null
                    ? `translateX(${lensLeft}px) scale(1.14)`
                    : `translateX(${shownIndex * 100}%)`,
              }}
            />
          )}

          {primaryItems.map((item, i) => {
            const active = shownIndex === i;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isNavItemActive(pathname, item.href) ? "page" : undefined}
                draggable={false}
                onClick={(e) => {
                  if (suppressClick.current) {
                    e.preventDefault();
                    return;
                  }
                  if (!isNavItemActive(pathname, item.href)) setPending({ index: i, from: pathname });
                }}
                className={cn(
                  "relative z-10 flex min-w-0 flex-col items-center gap-0.5 rounded-full py-2 text-[11px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "text-primary-text" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-6 shrink-0 transition-transform duration-200", active && "scale-110")} />
                <span className="truncate px-1">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => {
              if (suppressClick.current) return;
              setMoreOpen(true);
            }}
            className={cn(
              "relative z-10 flex min-w-0 flex-col items-center gap-0.5 rounded-full py-2 text-[11px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              shownIndex === SLOTS - 1 ? "text-primary-text" : "text-muted-foreground",
            )}
          >
            <MoreHorizontal className={cn("size-6 shrink-0 transition-transform duration-200", shownIndex === SLOTS - 1 && "scale-110")} />
            <span className="truncate px-1">More</span>
          </button>
        </div>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
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
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium",
                    active ? "border-primary/40 bg-primary/10 text-primary-text" : "border-transparent text-foreground",
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
