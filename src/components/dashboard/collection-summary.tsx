"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/utils/currency";

export function CollectionSummary({ collected, pending }: { collected: number; pending: number }) {
  const total = collected + pending;
  const collectedPct = total > 0 ? Math.round((collected / total) * 100) : 0;
  const data =
    total > 0
      ? [
          { name: "Collected", value: collected },
          { name: "Pending", value: pending },
        ]
      : [{ name: "No revenue yet", value: 1 }];
  const colors = total > 0 ? ["var(--working)", "var(--destructive)"] : ["var(--muted)"];

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto h-[160px] w-[160px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={54} outerRadius={78} paddingAngle={total > 0 ? 2 : 0} stroke="none">
              {data.map((entry, i) => (
                <Cell key={entry.name} fill={colors[i]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-extrabold">{collectedPct}%</p>
          <p className="text-xs text-muted-foreground">Collected</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2.5 rounded-full bg-working" />
            Collected
          </span>
          <span className="font-bold tabular-nums">{formatCurrency(collected)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2.5 rounded-full bg-destructive" />
            Pending
          </span>
          <span className="font-bold tabular-nums">{formatCurrency(pending)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm">
          <span className="text-muted-foreground">Total Revenue</span>
          <span className="font-bold tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}
