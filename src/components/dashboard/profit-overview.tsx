import { formatCurrencyCompact } from "@/lib/utils/currency";

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

      {/* Explicit rows (not 3 independently-flowing cells) so the values
          always share one baseline — "Money Earned"/"Actual Profit" wrap to
          2 lines at narrow widths while the shorter "Expenses" label stays
          on 1, and 3 separately-flowing cells let that push only two of the
          three values down, misaligning them. A shared grid row forces all
          three labels (and separately, all three values) to the same height. */}
      <div className="grid grid-cols-3 grid-rows-2 gap-x-3 gap-y-0.5 rounded-2xl bg-muted/40 p-3.5">
        <p className="col-start-1 row-start-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Money Earned
        </p>
        <p className="col-start-2 row-start-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Expenses
        </p>
        <p className="col-start-3 row-start-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Actual Profit
        </p>
        <p className="col-start-1 row-start-2 self-end text-xl font-extrabold tracking-tight text-primary tabular-nums sm:text-2xl">
          {formatCurrencyCompact(revenue)}
        </p>
        <p className="col-start-2 row-start-2 self-end text-xl font-extrabold tracking-tight text-destructive tabular-nums sm:text-2xl">
          {formatCurrencyCompact(expenses)}
        </p>
        <p className="col-start-3 row-start-2 self-end text-xl font-extrabold tracking-tight text-working tabular-nums sm:text-2xl">
          {formatCurrencyCompact(netProfit)}
        </p>
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
                    {formatCurrencyCompact(b.amount)} · {pct}%
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
