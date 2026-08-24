"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

/** Reveals a summary card's full, uncompacted value on hover (desktop) or
 * tap (mobile). Self-managed open state rather than the shared Tooltip
 * primitive — that one is hover/focus-only and never actually opens from a
 * real click/tap, which is exactly the behavior this needs on touch devices. */
export function ExactValueBadge({ exactValue }: { exactValue: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Exact value: ${exactValue}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="flex items-center text-muted-foreground/70 hover:text-muted-foreground"
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <span className="absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-background shadow-lg">
          {exactValue}
        </span>
      )}
    </span>
  );
}
