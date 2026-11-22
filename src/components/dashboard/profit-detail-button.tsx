"use client";

import Link from "next/link";
import { AlertTriangle, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils/currency";
import { formatHours } from "@/lib/utils/hours";
import type { getProfitOverview } from "@/lib/services/dashboard";
import type { Plain } from "@/lib/plain";

type Profit = Plain<Awaited<ReturnType<typeof getProfitOverview>>>;

/** Every number behind Business Profit Overview, line by line, so the owner can check the sum. */
export function ProfitDetailButton({ profit, periodLabel }: { profit: Profit; periodLabel: string }) {
  const d = profit.details;
  if (!d) return null;
  const r = d.revenue;
  const e = d.expenses;

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="ghost" className="h-8 gap-1 px-2 font-semibold text-primary-text" />}>
        <Calculator className="size-4" />
        Detail
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] gap-3 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Profit Calculation — {periodLabel}</DialogTitle>
        </DialogHeader>

        <Section title="Revenue — what all machines earned">
          <Line label={`Work done (${formatHours(r.workHours)})`} value={r.work} />
          <Sub label="already billed (bill amounts)" value={r.workBilled} />
          <Sub label="not billed yet (hours × site rate)" value={r.workUnbilled} />
          {r.unpricedHours > 0 && (
            <Warn>
              {formatHours(r.unpricedHours)} worked at sites with no rate set — counted as ₹0. Set the site rate in Site
              Analysis.
            </Warn>
          )}
          {r.otherBillLines !== 0 && <Line label="Summary / Direct bill lines" value={r.otherBillLines} />}
          {r.charges !== 0 && <Line label="Bill charges (transport, fuel, extra − discount)" value={r.charges} />}
          <Total label="Total revenue" value={profit.revenue} tone="text-primary-text" />
          <Note>GST is not counted — it is collected for the government.</Note>
        </Section>

        <Section title="Expenses">
          <Line label="Operator salary" value={e.salary} />
          <Note>Monthly salary, counted for the days of each month inside the period.</Note>

          <Line label="Diesel" value={e.diesel} />
          {e.dieselMachines.map((m) => (
            <Sub
              key={m.id}
              label={
                m.method === "purchases"
                  ? `${m.name}: diesel purchases recorded`
                  : m.method === "litres"
                    ? `${m.name}: ${m.litres} L × ${formatCurrency(e.dieselPricePerLitre ?? 0)}`
                    : `${m.name}: ${m.litres} L — no diesel price`
              }
              value={m.cost}
            />
          ))}
          {e.uncostedLitres > 0 && (
            <Warn>
              {e.uncostedLitres} L of diesel is not costed because no diesel price is set.{" "}
              <Link href="/settings" className="font-semibold underline">
                Set it in Settings
              </Link>{" "}
              or record diesel purchases in{" "}
              <Link href="/expenses" className="font-semibold underline">
                Expenses
              </Link>
              .
            </Warn>
          )}

          <Line label="Maintenance" value={Math.round((e.service + e.repairs) * 100) / 100} />
          <Sub label="service records" value={e.service} />
          <Sub label="repairs, parts, tyres (Expenses)" value={e.repairs} />
          {e.other !== 0 && <Line label="Other expenses (transport, other)" value={e.other} />}
          <Total label="Total expenses" value={profit.expenses} tone="text-destructive" />
        </Section>

        <Section title="Actual profit">
          <Line label="Revenue" value={profit.revenue} />
          <Line label="− Expenses" value={-profit.expenses} />
          <Total
            label="Actual profit"
            value={profit.netProfit}
            tone={profit.netProfit < 0 ? "text-destructive" : "text-working"}
          />
          <Note>
            Margin = profit ÷ revenue = {profit.revenue > 0 ? `${profit.profitMarginPct}%` : "— (no revenue)"}
          </Note>
        </Section>

        <p className="text-xs text-muted-foreground">
          Record diesel bought, repairs and parts in{" "}
          <Link href="/expenses" className="font-semibold text-primary-text underline">
            Expenses
          </Link>
          . Diesel price per litre is in{" "}
          <Link href="/settings" className="font-semibold text-primary-text underline">
            Settings
          </Link>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-xl bg-muted/40 p-3">
      <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

const money = (v: number) => (v < 0 ? `−${formatCurrency(-v)}` : formatCurrency(v));

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="shrink-0 font-semibold tabular-nums">{money(value)}</span>
    </div>
  );
}

function Sub({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pl-3 text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="shrink-0 tabular-nums">{money(value)}</span>
    </div>
  );
}

function Total({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-1.5 text-base font-bold">
      <span>{label}</span>
      <span className={`shrink-0 tabular-nums ${tone}`}>{money(value)}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
