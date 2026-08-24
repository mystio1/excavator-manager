"use client";

import { useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_MODE, MODE_STORAGE_KEY, type ColorMode } from "@/lib/theme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function apply(mode: ColorMode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const MODE_OPTIONS: { id: ColorMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Laptop },
];

export function ThemeSwitcher() {
  const [mode, setMode] = useState<ColorMode>(DEFAULT_MODE);

  useEffect(() => {
    // Reads browser-only localStorage to sync this component's highlighted
    // selection with what the no-flash script already applied to <html>.
    const storedMode = (localStorage.getItem(MODE_STORAGE_KEY) as ColorMode) || DEFAULT_MODE;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a browser-only API unavailable during SSR
    setMode(storedMode);
  }, []);

  const chooseMode = (id: ColorMode) => {
    setMode(id);
    localStorage.setItem(MODE_STORAGE_KEY, id);
    apply(id);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">Mode</p>
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-1">
          {MODE_OPTIONS.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => chooseMode(m.id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold transition-colors",
                  mode === m.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
                {m.label}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
