import { cache } from "react";
import { db } from "@/lib/db";
import { Decimal, ZERO, dec, round2 } from "@/lib/money";

// All salary arithmetic is exact (Decimal / NUMERIC) — see money.ts. The
// figures handed back to callers are plain numbers rounded to 2 dp (the same
// shape the UI always received), converted only at the very end.
type MonthTotals = { bonus: Decimal; deductions: Decimal; paid: Decimal };

const emptyTotals = (): MonthTotals => ({ bonus: ZERO, deductions: ZERO, paid: ZERO });

/** Exact Decimal → the 2 dp number the API/UI works with. */
const toMoney = (value: Decimal) => round2(value).toNumber();

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function applyTransaction(entry: MonthTotals, tx: { businessEffect: string; deductFromSalary: boolean; amount: Decimal }) {
  if (tx.businessEffect === "SALARY_PAYMENT") entry.paid = entry.paid.plus(tx.amount);
  else if (tx.businessEffect === "BONUS_INCENTIVE") entry.bonus = entry.bonus.plus(tx.amount);
  else if (tx.deductFromSalary) entry.deductions = entry.deductions.plus(tx.amount);
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
  baseSalary: Decimal,
  salaryStartsFrom: Date,
  monthStart: Date,
  byMonth: Map<string, MonthTotals>,
) {
  let cursor = new Date(salaryStartsFrom.getFullYear(), salaryStartsFrom.getMonth(), 1);
  let balance = ZERO;
  while (cursor < monthStart) {
    const entry = byMonth.get(monthKey(cursor)) ?? emptyTotals();
    balance = balance.plus(baseSalary).plus(entry.bonus).minus(entry.deductions).minus(entry.paid);
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

  const baseSalary = dec(operator.defaultMonthlySalary);
  const carriedForward = carriedForwardBalance(baseSalary, salaryStartsFrom, start, byMonth);

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

/** Same date, `n` months later — clamped to the last day of the target
 * month when the start day doesn't exist there (joined the 31st -> lands on
 * Feb 28/29, not March 3). Calendar-day arithmetic only, no time-of-day. */
function addMonthsClamped(date: Date, n: number) {
  const target = new Date(date.getFullYear(), date.getMonth() + n, 1);
  const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), daysInTargetMonth));
  return target;
}

export type AccrualBreakdown = {
  fullCycles: number;
  fullCyclesAmount: number;
  cycleStart: Date;
  cycleEnd: Date;
  cycleDays: number;
  elapsedDays: number;
  dailyRate: number;
  partialAmount: number;
  total: number;
};

/** Exact accrual: `totalExact` keeps the un-rounded partial-cycle amount so
 * the final payable is rounded ONCE, exactly like the original float math did
 * (rounding each part separately could shift a paisa). */
type Accrual = {
  fullCycles: number;
  fullCyclesAmount: Decimal;
  cycleStart: Date;
  cycleEnd: Date;
  cycleDays: number;
  elapsedDays: number;
  dailyRate: Decimal;
  partialExact: Decimal;
  totalExact: Decimal;
};

/**
 * Base salary earned from `joinDate` through `asOf`, accrued day by day
 * instead of by whole calendar months — this is the "not monthly full
 * payment, calculate till the date" behavior: each complete join-date
 * anniversary cycle (e.g. 7 Jun -> 7 Jul) counts as one full baseSalary: a
 * cycle that hasn't finished yet is prorated by the days elapsed into it
 * over that specific cycle's own length (28-31 days, whichever months it
 * spans), not a flat 30 — so "8 Jul" (1 day into the 7 Jul -> 7 Aug cycle)
 * adds baseSalary / 31 for that one day, and so on up to `asOf`. Returns
 * every intermediate figure, not just the total, so a caller (the Overview
 * tab's "Detail" breakdown) can show exactly how the number was reached
 * instead of restating the total in prose.
 */
function accrueBaseSalary(joinDate: Date, asOf: Date, baseSalary: Decimal): Accrual {
  const join = new Date(joinDate.getFullYear(), joinDate.getMonth(), joinDate.getDate());
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  if (today <= join) {
    return {
      fullCycles: 0,
      fullCyclesAmount: ZERO,
      cycleStart: join,
      cycleEnd: join,
      cycleDays: 0,
      elapsedDays: 0,
      dailyRate: ZERO,
      partialExact: ZERO,
      totalExact: ZERO,
    };
  }

  let fullCycles = 0;
  let cycleStart = join;
  let cycleEnd = addMonthsClamped(join, 1);
  while (cycleEnd <= today) {
    fullCycles++;
    cycleStart = cycleEnd;
    cycleEnd = addMonthsClamped(join, fullCycles + 1);
  }

  const cycleDays = Math.round((cycleEnd.getTime() - cycleStart.getTime()) / 86_400_000);
  const elapsedDays = Math.round((today.getTime() - cycleStart.getTime()) / 86_400_000);
  const dailyRate = cycleDays > 0 ? baseSalary.div(cycleDays) : ZERO;
  const fullCyclesAmount = baseSalary.times(fullCycles);
  // One division (base × days ÷ cycle) instead of (base ÷ cycle) × days keeps
  // the most precision before the single final rounding.
  const partialExact = cycleDays > 0 ? baseSalary.times(elapsedDays).div(cycleDays) : ZERO;

  return {
    fullCycles,
    fullCyclesAmount,
    cycleStart,
    cycleEnd,
    cycleDays,
    elapsedDays,
    dailyRate,
    partialExact,
    totalExact: fullCyclesAmount.plus(partialExact),
  };
}

function presentAccrual(accrual: Accrual): AccrualBreakdown {
  return {
    fullCycles: accrual.fullCycles,
    fullCyclesAmount: toMoney(accrual.fullCyclesAmount),
    cycleStart: accrual.cycleStart,
    cycleEnd: accrual.cycleEnd,
    cycleDays: accrual.cycleDays,
    elapsedDays: accrual.elapsedDays,
    dailyRate: toMoney(accrual.dailyRate),
    partialAmount: toMoney(accrual.partialExact),
    total: toMoney(accrual.totalExact),
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
export async function getLifetimeSalarySummary(businessId: string, operatorId: string) {
  const operator = await db.operator.findFirstOrThrow({ where: { id: operatorId, businessId } });

  const now = new Date();
  const salaryStartsFrom = operator.joiningDate ?? operator.createdAt;
  const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const transactions = await db.operatorTransaction.findMany({
    where: { businessId, operatorId, date: { gte: salaryStartsFrom, lt: rangeEnd } },
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
    totalPayable: toMoney(totalPayable),
    totalPaid: toMoney(totals.paid),
    remaining: toMoney(totalPayable.minus(totals.paid)),
  };
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
    select: { operatorId: true, date: true, amount: true, businessEffect: true, deductFromSalary: true },
  });

  const byOperator = new Map<string, MonthTotals>();
  for (const tx of transactions) {
    if (tx.date < (startByOperator.get(tx.operatorId) ?? earliestStart)) continue;
    const entry = byOperator.get(tx.operatorId) ?? emptyTotals();
    applyTransaction(entry, tx);
    byOperator.set(tx.operatorId, entry);
  }

  return operators.map((op) => {
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

  return operators.map((op) => {
    const byMonth = byOperatorMonth.get(op.id) ?? new Map<string, MonthTotals>();
    const salaryStartsFrom = op.joiningDate ?? op.createdAt;
    const baseSalary = dec(op.defaultMonthlySalary);
    const carriedForward = carriedForwardBalance(baseSalary, salaryStartsFrom, start, byMonth);
    const thisMonth = byMonth.get(monthKey(start)) ?? emptyTotals();
    const payable = baseSalary.plus(thisMonth.bonus).minus(thisMonth.deductions).minus(thisMonth.paid).plus(carriedForward);
    return { operatorId: op.id, baseSalary, bonus: thisMonth.bonus, payable };
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
    const payable = round2(op.payable);
    if (payable.gt(0)) total = total.plus(payable);
  }
  return toMoney(total);
}
