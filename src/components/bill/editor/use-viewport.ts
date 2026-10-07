"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

/** Tailwind's `md` breakpoint: at and above it the grid is a table, below it
 * every row is a card. */
const DESKTOP_QUERY = "(min-width: 768px)";

/** True at `md` and wider. The editor only renders after its data has loaded on
 * the client, so the server snapshot (desktop) is never what a user sees. */
export function useIsDesktop(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

/** True while the element behind the returned ref is at least `minRem` rem
 * wide. The bill table needs room for its columns, and that depends on the
 * space beside the sidebar rather than on the window, so the table-or-cards
 * choice is made from the container's own width. */
export function useWideContainer(minRem: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setWide(el.clientWidth >= minRem * rootPx);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [minRem]);
  return { ref, wide };
}

/** How much the visible viewport must shrink before we call it an on-screen
 * keyboard (a mobile address bar collapsing is far smaller than this). */
const KEYBOARD_MIN_SHRINK_PX = 150;

const TEXT_ENTRY = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select";

/** True while an on-screen keyboard is covering the lower part of the screen,
 * so fixed bottom bars can get out of the way of the field being typed in.
 * Detected as the visual viewport shrinking well below the tallest it has been
 * while a text field has focus (works for iOS, Chrome and the Android WebView,
 * whether the keyboard resizes the layout viewport or only the visual one). A
 * change of width means rotation or a window resize, which restarts the
 * measurement; pinch-zoom is ignored. */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let width = window.innerWidth;
    let tallest = Math.max(window.innerHeight, vv.height);
    const update = () => {
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        tallest = 0;
      }
      tallest = Math.max(tallest, window.innerHeight, vv.height);
      const typing = document.activeElement?.matches(TEXT_ENTRY) ?? false;
      setOpen(typing && vv.scale <= 1.01 && tallest - vv.height > KEYBOARD_MIN_SHRINK_PX);
    };
    vv.addEventListener("resize", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      vv.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  return open;
}
