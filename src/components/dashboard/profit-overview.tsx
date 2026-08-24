import { formatCurrency } from "@/lib/utils/currency";

type Breakdown = { label: string; amount: number };

const BAR_COLORS = ["var(--purple)", "var(--info)", "var(--idle-foreground)", "var(--working)", "var(--muted-foreground)"];

export function ProfitOverview({
  revenue,
  expenses,
  netProfit,
  profitMarginPct,
  breakdown,
}: {
  revenue: number;
  expenses: number;
  netProfit: number;
  profitMarginPct: number;
  breakdown: Breakdown[];
}) {
  const marginTone = profitMarginPct >= 40 ? "text-working" : profitMarginPct >= 15 ? "text-idle-foreground" : "text-destructive";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Revenue − Expenses = Net Profit, for this month.</p>

      <div className="grid grid-cols-3 gap-3 rounded-2xl bg-muted/40 p-3.5">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Money Earned</p>
          <p className="mt-0.5 text-xl font-extrabold tracking-tight text-primary tabular-nums sm:text-2xl">
            {formatCurrency(revenue)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Expenses</p>
          <p className="mt-0.5 text-xl font-extrabold tracking-tight text-destructive tabular-nums sm:text-2xl">
            {formatCurrency(expenses)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Actual Profit</p>
          <p className="mt-0.5 text-xl font-extrabold tracking-tight text-working tabular-nums sm:text-2xl">
            {formatCurrency(netProfit)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3.5 py-2.5">
        <span className="text-sm font-semibold text-muted-foreground">Profit Margin</span>
        <span className={`text-base font-extrabold ${marginTone}`}>{profitMarginPct}%</span>
      </div>

      {breakdown.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-semibold text-muted-foreground">Expense Breakdown</p>
          {breakdown.map((b, i) => {
            const pct = expenses > 0 ? Math.round((b.amount / expenses) * 100) : 0;
            return (
              <div key={b.label} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{b.label}</span>
                  <span className="font-bold">
                    {formatCurrency(b.amount)} · {pct}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No tracked expenses this month.</p>
      )}
    </div>
  );
}
