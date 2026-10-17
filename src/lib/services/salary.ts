import { cache } from "react";
import { db } from "@/lib/db";
import { Decimal, ZERO, dec, round2 } from "@/lib/money";
import {
  accrueBaseSalary,
  applyTransaction,
  emptyTotals,
  isDeduction,
  monthKey,
  presentAccrual,
  toMoney,
  type AccrualBreakdown,
  type MonthTotals,
} from "./salaryCore";
import {
  calculateOperatorPeriods,
  dayIndex,
  isLegacyShape,
  loadPeriodContext,
  type LeaveDeductionLine,
  type LeaveRow,
  type PeriodRow,
} from "./workingPeriods";

export type { AccrualBreakdown };

/**
 * Base salary for the calendar month starting at `monthStart` for an operator with several working periods
 * or leaves: the monthly salary of the (latest) working period overlapping that month, the preceding
 * period's rate for a month touched only by PAID leave, and ZERO for a month entirely before the first
 * period or inside an unpaid leave gap. Legacy-shaped operators use a constant base instead.
 */
function periodMonthBase(periods: PeriodRow[], leaves: LeaveRow[]) {
  return (monthStart: Date): Decimal => {
    const m0 = dayIndex(monthStart);
    const m1 = dayIndex(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0));
    let rate: Decimal | null = null;
    for (const p of periods) {
      const s = dayIndex(p.startDate);
      const e = p.endDate ? dayIndex(p.endDate) : Number.MAX_SAFE_INTEGER;
      if (s <= m1 && e >= m0) rate = dec(p.monthlySalary);
    }
    if (rate === null) {
      for (const l of leaves) {
        if (l.type !== "PAID" || dayIndex(l.startDate) > m1 || dayIndex(l.endDate) < m0) continue;
        let prev: PeriodRow | null = null;
        for (const p of periods) if (p.endDate && dayIndex(p.endDate) < dayIndex(l.startDate)) prev = p;
        if (prev) rate = dec(prev.monthlySalary);
      }
    }
    return rate ?? ZERO;
  };
}

/**
 * The running balance an operator carries INTO `monthStart` — every prior
 * calendar month (since `salaryStartsFrom`) contributes
 * baseSalary + bonus - deductions - paid, positive or negative, and it all
 * accumulates. A month with zero transactions still contributes the full
 * baseSalary as owed (nothing was paid that month), matching "if not paid
 * of earlier one" — this is what makes an unpaid month keep showing up in
 * every later month's total until it's actually settled.
 */
function carriedForwardBalance(
  baseFor: (monthStart: Date) => Decimal,
  salaryStartsFrom: Date,
  monthStart: Date,
  byMonth: Map<string, MonthTotals>,
) {
  let cursor = new Date(salaryStartsFrom.getFullYear(), salaryStartsFrom.getMonth(), 1);
  let balance = ZERO;
  while (cursor < monthStart) {
    const entry = byMonth.get(monthKey(cursor)) ?? emptyTotals();
    balance = balance.plus(baseFor(cursor)).plus(entry.bonus).minus(entry.deductions).minus(entry.paid);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return balance;
}

/**
 * Salary is never stored or hand-calculated — it's computed live from the
 * operator's base salary plus every transaction dated within the given
 * calendar month, per spec §5:
 *
 *   Final Salary Payable = Base Salary + Bonuses/Incentives
 *                           - Deductible Transactions - Salary Already Paid
 *                           + whatever was left over (unpaid or overpaid)
 *                             from every earlier month
 *
 * Nothing here is summed twice: a transaction contributes to exactly one of
 * bonus/deduction/paid based on its own businessEffect/deductFromSalary
 * fields, so there's no separate "applied" flag that could desync. The
 * carry-forward balance is likewise always recomputed from the operator's
 * full transaction history, never persisted, so it can never drift out of
 * sync with the transactions themselves.
 */
export async function computeSalaryForMonth(businessId: string, operatorId: string, year: number, month: number) {
  const operator = await db.operator.findFirstOrThrow({ where: { id: operatorId, businessId } });

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  const salaryStartsFrom = operator.joiningDate ?? operator.createdAt;
  const rangeStart = new Date(
    Math.min(new Date(salaryStartsFrom.getFullYear(), salaryStartsFrom.getMonth(), 1).getTime(), start.getTime()),
  );

  const allTransactions = await db.operatorTransaction.findMany({
    where: { businessId, operatorId, date: { gte: rangeStart, lt: end } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    include: { category: { select: { name: true } } },
  });

  const byMonth = new Map<string, MonthTotals>();
  for (const tx of allTransactions) {
    const key = monthKey(tx.date);
    const entry = byMonth.get(key) ?? emptyTotals();
    applyTransaction(entry, tx);
    byMonth.set(key, entry);
  }

  // One ACTIVE period and no leaves: the original computation, untouched. Otherwise a month earns
  // salary only while a working period (or paid leave) covers it.
  const periodCtx = await loadPeriodContext(db, operator);
  const baseFor = isLegacyShape(periodCtx.periods, periodCtx.leaves)
    ? (() => {
        const constant = dec(operator.defaultMonthlySalary);
        return () => constant;
      })()
    : periodMonthBase(periodCtx.periods, periodCtx.leaves);
  const baseSalary = baseFor(start);
  const carriedForward = carriedForwardBalance(baseFor, salaryStartsFrom, start, byMonth);

  const thisMonth = byMonth.get(monthKey(start)) ?? emptyTotals();
  const transactions = allTransactions.filter((tx) => tx.date >= start && tx.date < end);

  const payable = baseSalary.plus(thisMonth.bonus).minus(thisMonth.deductions).minus(thisMonth.paid).plus(carriedForward);

  return {
    operatorName: operator.name,
    baseSalary: toMoney(baseSalary),
    bonus: toMoney(thisMonth.bonus),
    deductions: toMoney(thisMonth.deductions),
    alreadyPaid: toMoney(thisMonth.paid),
    carriedForward: toMoney(carriedForward),
    payable: toMoney(payable),
    transactions,
  };
}

/**
 * Lifetime totals from the operator's joining date through today — what the
 * Overview tab shows: Total Payable (base salary accrued day-by-day per
 * accrueBaseSalary, plus every bonus, minus every deduction), Given (every
 * SALARY_PAYMENT ever recorded), and Remaining (the difference — same sign
 * convention as carriedForward: positive still owed, negative overpaid).
 * Also returns the accrual's own intermediate figures and the date range
 * they cover, for the Overview tab's "Detail" breakdown — never
 * re-derived/approximated on the client, always the exact numbers this
 * function actually computed with.
 */
/** One line behind the Deductions total, so the Detail dialog can say what each
 * one was for rather than showing a bare figure. */
export type DeductionLine = {
  id: string;
  date: Date;
  amount: number;
  /** The category the owner filed it under ("Damage", "Salary Advance", ...). */
  category: string | null;
  notes: string | null;
};

const DEDUCTION_EFFECT_LABEL: Record<string, string> = {
  ADVANCE_RECOVERABLE: "Salary Advance",
  BUSINESS_EXPENSE: "Deduction",
  OTHER: "Adjustment",
};

function toDeductionLines(
  transactions: {
    id: string;
    date: Date;
    amount: Decimal;
    notes: string | null;
    businessEffect: string;
    deductFromSalary: boolean;
    category?: { name: string } | null;
  }[],
): DeductionLine[] {
  return transactions
    .filter(isDeduction)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((tx) => ({
      id: tx.id,
      date: tx.date,
      amount: toMoney(dec(tx.amount)),
      category: tx.category?.name ?? DEDUCTION_EFFECT_LABEL[tx.businessEffect] ?? null,
      notes: tx.notes,
    }));
}

export async function getLifetimeSalarySummary(businessId: string, operatorId: string) {
  const operator = await db.operator.findFirstOrThrow({ where: { id: operatorId, businessId } });

  const now = new Date();

  // Several working periods (or any leave, or a closed sole period): the figures come from the periods —
  // "remaining" is the operator's Total Outstanding across all sessions. Same response shape.
  const periodCtx = await loadPeriodContext(db, operator);
  if (!isLegacyShape(periodCtx.periods, periodCtx.leaves)) {
    const allTx = await db.operatorTransaction.findMany({
      where: { businessId, operatorId },
      include: { category: { select: { name: true } } },
    });
    const calc = calculateOperatorPeriods(periodCtx.periods, periodCtx.leaves, allTx, now);
    const current = calc.periods.find((p) => p.status === "ACTIVE") ?? calc.periods[calc.periods.length - 1]!;
    return {
      joiningDate: calc.periods[0]!.startDate,
      asOf: now,
      baseSalary: current.monthlySalary,
      accrual: current.accrual,
      bonus: toMoney(calc.exact.bonus),
      deductions: toMoney(calc.exact.deductions),
      deductionLines: toDeductionLines(allTx),
      unpaidLeave: toMoney(calc.exact.unpaidLeave),
      unpaidLeaveLines: calc.periods.flatMap((p) => p.unpaidLeaveLines),
      totalPayable: toMoney(calc.exact.outstanding.plus(calc.exact.paid)),
      totalPaid: toMoney(calc.exact.paid),
      remaining: calc.summary.totalOutstanding,
      multiPeriod: true,
    };
  }

  const salaryStartsFrom = operator.joiningDate ?? operator.createdAt;
  const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const transactions = await db.operatorTransaction.findMany({
    where: { businessId, operatorId, date: { gte: salaryStartsFrom, lt: rangeEnd } },
    include: { category: { select: { name: true } } },
  });

  const totals = emptyTotals();
  for (const tx of transactions) applyTransaction(totals, tx);

  const baseSalary = dec(operator.defaultMonthlySalary);
  const accrual = accrueBaseSalary(salaryStartsFrom, now, baseSalary);
  const totalPayable = accrual.totalExact.plus(totals.bonus).minus(totals.deductions);

  return {
    joiningDate: salaryStartsFrom,
    asOf: now,
    baseSalary: toMoney(baseSalary),
    accrual: presentAccrual(accrual),
    bonus: toMoney(totals.bonus),
    deductions: toMoney(totals.deductions),
    deductionLines: toDeductionLines(transactions),
    // The legacy shape is one open period with no leave at all, so there is
    // never anything to deduct here — the field exists to keep one response shape.
    unpaidLeave: 0,
    unpaidLeaveLines: [] as LeaveDeductionLine[],
    totalPayable: toMoney(totalPayable),
    totalPaid: toMoney(totals.paid),
    remaining: toMoney(totalPayable.minus(totals.paid)),
    multiPeriod: false,
  };
}

/** Which of these operators need the period-based computation (more than one period, a leave, or a closed
 * sole period), with their periods and leaves — 2 queries regardless of operator count. */
async function complexOperators(businessId: string, operatorIds: string[]) {
  const [periods, leaves] = await Promise.all([
    db.operatorWorkingPeriod.findMany({
      where: { businessId, operatorId: { in: operatorIds } },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    }),
    db.operatorLeave.findMany({ where: { businessId, operatorId: { in: operatorIds } }, orderBy: { startDate: "asc" } }),
  ]);
  const periodsOf = new Map<string, PeriodRow[]>();
  for (const p of periods) periodsOf.set(p.operatorId, [...(periodsOf.get(p.operatorId) ?? []), p]);
  const leavesOf = new Map<string, LeaveRow[]>();
  for (const l of leaves) leavesOf.set(l.operatorId, [...(leavesOf.get(l.operatorId) ?? []), l]);
  const complex = new Set<string>();
  for (const [id, ps] of periodsOf) if (!isLegacyShape(ps, leavesOf.get(id) ?? [])) complex.add(id);
  return { complex, periodsOf, leavesOf };
}

/**
 * Same math as getLifetimeSalarySummary, for every operator in the business
 * at once — 2 queries total (regardless of operator count) instead of 2 per
 * operator, for the Operators list page's per-card "remaining" figure.
 */
export async function getLifetimeSalaryBreakdown(businessId: string) {
  const operators = await db.operator.findMany({
    where: { businessId, isArchived: false },
    select: { id: true, defaultMonthlySalary: true, joiningDate: true, createdAt: true },
  });
  if (operators.length === 0) return [];

  const now = new Date();
  const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const startByOperator = new Map(operators.map((op) => [op.id, op.joiningDate ?? op.createdAt]));
  const earliestStart = operators.reduce((earliest, op) => {
    const start = op.joiningDate ?? op.createdAt;
    return start < earliest ? start : earliest;
  }, now);

  const transactions = await db.operatorTransaction.findMany({
    where: { businessId, date: { gte: earliestStart, lt: rangeEnd } },
    select: { operatorId: true, date: true, amount: true, businessEffect: true, deductFromSalary: true, workingPeriodId: true },
  });

  // Operators with several periods / any leave use their period totals (Total Outstanding).
  const { complex, periodsOf, leavesOf } = await complexOperators(businessId, operators.map((o) => o.id));
  const byOperator = new Map<string, MonthTotals>();
  for (const tx of transactions) {
    if (tx.date < (startByOperator.get(tx.operatorId) ?? earliestStart)) continue;
    const entry = byOperator.get(tx.operatorId) ?? emptyTotals();
    applyTransaction(entry, tx);
    byOperator.set(tx.operatorId, entry);
  }

  return operators.map((op) => {
    if (complex.has(op.id)) {
      const mine = transactions.filter((tx) => tx.operatorId === op.id);
      const calc = calculateOperatorPeriods(periodsOf.get(op.id)!, leavesOf.get(op.id) ?? [], mine, now);
      return { operatorId: op.id, remaining: calc.summary.totalOutstanding };
    }
    const totals = byOperator.get(op.id) ?? emptyTotals();
    const salaryStartsFrom = startByOperator.get(op.id)!;
    const totalPayable = accrueBaseSalary(salaryStartsFrom, now, dec(op.defaultMonthlySalary)).totalExact
      .plus(totals.bonus)
      .minus(totals.deductions);
    return { operatorId: op.id, remaining: toMoney(totalPayable.minus(totals.paid)) };
  });
}

/**
 * Same math as computeSalaryForMonth, for every operator in the business at
 * once — 2 queries total (regardless of operator count or how far back
 * their history goes) instead of 2 per operator. getTotalSalaryDue and
 * getProfitOverview both need this same per-operator breakdown for the
 * current month; cache()'d so both, invoked concurrently from the
 * dashboard's top-level Promise.all, share one computation instead of
 * running it twice. (Kept as exact Decimals here so nothing is summed as a
 * float; the exported wrappers convert at the boundary.)
 */
const salaryBreakdownExact = cache(async function salaryBreakdownExact(businessId: string, year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  const operators = await db.operator.findMany({
    where: { businessId, isArchived: false },
    select: { id: true, defaultMonthlySalary: true, joiningDate: true, createdAt: true },
  });
  if (operators.length === 0) return [];

  const rangeStart = operators.reduce((earliest, op) => {
    const d = op.joiningDate ?? op.createdAt;
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    return monthStart < earliest ? monthStart : earliest;
  }, start);

  const transactions = await db.operatorTransaction.findMany({
    where: { businessId, date: { gte: rangeStart, lt: end } },
    select: { operatorId: true, date: true, amount: true, businessEffect: true, deductFromSalary: true },
  });

  const byOperatorMonth = new Map<string, Map<string, MonthTotals>>();
  for (const tx of transactions) {
    const byMonth = byOperatorMonth.get(tx.operatorId) ?? new Map<string, MonthTotals>();
    const entry = byMonth.get(monthKey(tx.date)) ?? emptyTotals();
    applyTransaction(entry, tx);
    byMonth.set(monthKey(tx.date), entry);
    byOperatorMonth.set(tx.operatorId, byMonth);
  }

  // Operators with several periods / any leave: gap-aware month base, and their period-based Total
  // Outstanding (as of now) for the dashboard's "salary due".
  const { complex, periodsOf, leavesOf } = await complexOperators(businessId, operators.map((o) => o.id));
  const complexTx =
    complex.size > 0
      ? await db.operatorTransaction.findMany({ where: { businessId, operatorId: { in: [...complex] } } })
      : [];

  return operators.map((op) => {
    const byMonth = byOperatorMonth.get(op.id) ?? new Map<string, MonthTotals>();
    const salaryStartsFrom = op.joiningDate ?? op.createdAt;
    const isComplex = complex.has(op.id);
    const baseFor = isComplex
      ? periodMonthBase(periodsOf.get(op.id)!, leavesOf.get(op.id) ?? [])
      : (() => {
          const constant = dec(op.defaultMonthlySalary);
          return () => constant;
        })();
    const baseSalary = baseFor(start);
    const carriedForward = carriedForwardBalance(baseFor, salaryStartsFrom, start, byMonth);
    const thisMonth = byMonth.get(monthKey(start)) ?? emptyTotals();
    const payable = baseSalary.plus(thisMonth.bonus).minus(thisMonth.deductions).minus(thisMonth.paid).plus(carriedForward);
    const outstanding = isComplex
      ? calculateOperatorPeriods(
          periodsOf.get(op.id)!,
          leavesOf.get(op.id) ?? [],
          complexTx.filter((tx) => tx.operatorId === op.id),
          new Date(),
        ).exact.outstanding
      : null;
    return { operatorId: op.id, baseSalary, bonus: thisMonth.bonus, payable, outstanding };
  });
});

export async function getSalaryBreakdownForMonth(businessId: string, year: number, month: number) {
  const breakdown = await salaryBreakdownExact(businessId, year, month);
  return breakdown.map((op) => ({
    operatorId: op.operatorId,
    baseSalary: toMoney(op.baseSalary),
    bonus: toMoney(op.bonus),
    payable: toMoney(op.payable),
  }));
}

/** Sum of every operator's current-month remaining payable (already
 * includes any carried-forward balance from earlier months) — feeds the
 * Dashboard's "Operator Salary Due" card. */
export async function getTotalSalaryDue(businessId: string) {
  const now = new Date();
  const breakdown = await salaryBreakdownExact(businessId, now.getFullYear(), now.getMonth());

  // Each operator's payable is rounded to the paisa before summing, matching
  // the per-operator figures shown elsewhere.
  let total = ZERO;
  for (const op of breakdown) {
    const payable = round2(op.outstanding ?? op.payable);
    if (payable.gt(0)) total = total.plus(payable);
  }
  return toMoney(total);
}
