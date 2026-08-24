"use client";

import { useMemo, useState } from "react";
import { Droplet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DieselCheckerForm() {
  const [totalHours, setTotalHours] = useState("");
  const [totalDiesel, setTotalDiesel] = useState("");
  const [remainingDiesel, setRemainingDiesel] = useState("");

  const result = useMemo(() => {
    const hours = Number(totalHours);
    const taken = Number(totalDiesel);
    if (!totalHours || !totalDiesel || hours <= 0 || taken < 0) return null;

    const remaining = Number(remainingDiesel);
    const hasRemaining = remainingDiesel !== "" && remaining >= 0;
    // Diesel taken includes whatever's still sitting in the tank — actual
    // consumption only counts what's no longer there.
    const consumed = hasRemaining ? Math.max(0, taken - remaining) : taken;
    const avgLitersPerHour = Math.round((consumed / hours) * 100) / 100;
    const estimatedHoursLeft =
      hasRemaining && avgLitersPerHour > 0 ? Math.round((remaining / avgLitersPerHour) * 100) / 100 : null;

    return { consumed, hasRemaining, avgLitersPerHour, estimatedHoursLeft };
  }, [totalHours, totalDiesel, remainingDiesel]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="totalHours" className="text-base">
              Total Hours
            </Label>
            <Input
              id="totalHours"
              type="number"
              step="0.1"
              min="0"
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
              placeholder="e.g. 250"
              className="h-12 text-base"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="totalDiesel" className="text-base">
              Total Diesel Taken (L)
            </Label>
            <Input
              id="totalDiesel"
              type="number"
              step="0.1"
              min="0"
              value={totalDiesel}
              onChange={(e) => setTotalDiesel(e.target.value)}
              placeholder="e.g. 1250"
              className="h-12 text-base"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="remainingDiesel" className="text-base">
              Remaining Diesel in Tank (L) (Optional)
            </Label>
            <Input
              id="remainingDiesel"
              type="number"
              step="0.1"
              min="0"
              value={remainingDiesel}
              onChange={(e) => setRemainingDiesel(e.target.value)}
              placeholder="e.g. 80"
              className="h-12 text-base"
            />
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Droplet className="size-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Average Diesel Usage</p>
                <p className="text-2xl font-extrabold tracking-tight">{result.avgLitersPerHour} L/hr</p>
              </div>
            </div>
            {result.hasRemaining && (
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">Diesel actually consumed (Taken − Remaining)</span>
                <span className="font-semibold">{result.consumed} L</span>
              </div>
            )}
            {result.estimatedHoursLeft != null && (
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">Estimated hours left on remaining diesel</span>
                <span className="font-semibold">{result.estimatedHoursLeft} hrs</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
