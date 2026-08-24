"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatCurrency } from "@/lib/utils/currency";

// Functions can't be passed as props from a Server Component to a Client
// Component (not serializable), so the formatter is picked here from a
// plain string flag instead of being handed in as a callback.
const FORMATTERS = {
  currency: (v: number) => formatCurrency(v),
  hours: (v: number) => `${v} hrs`,
} as const;

export function MonthlyBarChart({
  data,
  dataKey,
  seriesLabel,
  valueKind,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  seriesLabel: string;
  valueKind: keyof typeof FORMATTERS;
}) {
  const formatValue = FORMATTERS[valueKind];
  const gradientId = `fill-${dataKey}`;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          cursor={{ stroke: "var(--primary)", strokeWidth: 1, strokeDasharray: "3 3" }}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontSize: 13,
            boxShadow: "0 8px 24px -8px rgba(0,0,0,0.25)",
          }}
          formatter={(value) => [formatValue(Number(value)), seriesLabel]}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke="var(--primary)"
          strokeWidth={2.5}
          fill={`url(#${gradientId})`}
          activeDot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
