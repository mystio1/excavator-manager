"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODE_STORAGE_KEY } from "@/lib/theme";

/** Compact icon-only light/dark toggle (unlike the full light/dark/system
 * card in Settings) — for surfaces like the operator header that need a
 * quick switch without a dedicated settings page. Reads/writes the same
 * localStorage key so it stays in sync with the Settings switcher. */
export function ThemeToggleButton() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the DOM class the no-flash script already applied
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(MODE_STORAGE_KEY, next ? "dark" : "light");
  };

  return (
    <Button type="button" size="icon-sm" variant="ghost" onClick={toggle} aria-label="Toggle light/dark mode">
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
