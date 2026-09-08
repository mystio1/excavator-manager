import { cache } from "react";
import { db } from "@/lib/db";

type MonthTotals = { bonus: number; deductions: number; paid: number };

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function applyTransaction(entry: MonthTotals, tx: { businessEffect: string; deductFromSalary: boolean; amount: number }) {
  if (tx.businessEffect === "SALARY_PAYMENT") entry.paid += tx.amount;
  else if (tx.businessEffect === "BONUS_INCENTIVE") entry.bonus += tx.amount;
  else if (tx.deductFromSalary) entry.deductions += tx.amount;
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
  baseSalary: number,
  salaryStartsFrom: Date,
  monthStart: Date,
  byMonth: Map<string, MonthTotals>,
) {
  let cursor = new Date(salaryStartsFrom.getFullYear(), salaryStartsFrom.getMonth(), 1);
  let balance = 0;
  while (cursor < monthStart) {
    const entry = byMonth.get(monthKey(cursor)) ?? { bonus: 0, deductions: 0, paid: 0 };
    balance += baseSalary + entry.bonus - entry.deductions - entry.paid;
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
    orderBy: { date: "asc" },
    include: { category: { select: { name: true } } },
  });

  const byMonth = new Map<string, MonthTotals>();
  for (const tx of allTransactions) {
    const key = monthKey(tx.date);
    const entry = byMonth.get(key) ?? { bonus: 0, deductions: 0, paid: 0 };
    applyTransaction(entry, tx);
    byMonth.set(key, entry);
  }

  const baseSalary = operator.defaultMonthlySalary;
  const carriedForward = carriedForwardBalance(baseSalary, salaryStartsFrom, start, byMonth);

  const thisMonth = byMonth.get(monthKey(start)) ?? { bonus: 0, deductions: 0, paid: 0 };
  const transactions = allTransactions.filter((tx) => tx.date >= start && tx.date < end);

  const payable = Math.round((baseSalary + thisMonth.bonus - thisMonth.deductions - thisMonth.paid + carriedForward) * 100) / 100;

  return {
    operatorName: operator.name,
    baseSalary,
    bonus: Math.round(thisMonth.bonus * 100) / 100,
    deductions: Math.round(thisMonth.deductions * 100) / 100,
    alreadyPaid: Math.round(thisMonth.paid * 100) / 100,
    carriedForward: Math.round(carriedForward * 100) / 100,
    payable,
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
function accrueBaseSalary(joinDate: Date, asOf: Date, baseSalary: number): AccrualBreakdown {
  const join = new Date(joinDate.getFullYear(), joinDate.getMonth(), joinDate.getDate());
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  if (today <= join) {
    return { fullCycles: 0, fullCyclesAmount: 0, cycleStart: join, cycleEnd: join, cycleDays: 0, elapsedDays: 0, dailyRate: 0, partialAmount: 0, total: 0 };
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
  const dailyRate = cycleDays > 0 ? baseSalary / cycleDays : 0;
  const fullCyclesAmount = fullCycles * baseSalary;
  const partialAmount = dailyRate * elapsedDays;

  return { fullCycles, fullCyclesAmount, cycleStart, cycleEnd, cycleDays, elapsedDays, dailyRate, partialAmount, total: fullCyclesAmount + partialAmount };
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

  const totals: MonthTotals = { bonus: 0, deductions: 0, paid: 0 };
  for (const tx of transactions) applyTransaction(totals, tx);

  const accrual = accrueBaseSalary(salaryStartsFrom, now, operator.defaultMonthlySalary);
  const totalPayable = accrual.total + totals.bonus - totals.deductions;

  return {
    joiningDate: salaryStartsFrom,
    asOf: now,
    baseSalary: operator.defaultMonthlySalary,
    accrual,
    bonus: Math.round(totals.bonus * 100) / 100,
    deductions: Math.round(totals.deductions * 100) / 100,
    totalPayable: Math.round(totalPayable * 100) / 100,
    totalPaid: Math.round(totals.paid * 100) / 100,
    remaining: Math.round((totalPayable - totals.paid) * 100) / 100,
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
    const entry = byOperator.get(tx.operatorId) ?? { bonus: 0, deductions: 0, paid: 0 };
    applyTransaction(entry, tx);
    byOperator.set(tx.operatorId, entry);
  }

  return operators.map((op) => {
    const totals = byOperator.get(op.id) ?? { bonus: 0, deductions: 0, paid: 0 };
    const salaryStartsFrom = startByOperator.get(op.id)!;
    const totalPayable = accrueBaseSalary(salaryStartsFrom, now, op.defaultMonthlySalary).total + totals.bonus - totals.deductions;
    return { operatorId: op.id, remaining: Math.round((totalPayable - totals.paid) * 100) / 100 };
  });
}

/**
 * Same math as computeSalaryForMonth, for every operator in the business at
 * once — 2 queries total (regardless of operator count or how far back
 * their history goes) instead of 2 per operator. getTotalSalaryDue and
 * getProfitOverview both need this same per-operator breakdown for the
 * current month; cache()'d so both, invoked concurrently from the
 * dashboard's top-level Promise.all, share one computation instead of
 * running it twice.
 */
export const getSalaryBreakdownForMonth = cache(async function getSalaryBreakdownForMonth(
  businessId: string,
  year: number,
  month: number,
) {
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
    const entry = byMonth.get(monthKey(tx.date)) ?? { bonus: 0, deductions: 0, paid: 0 };
    applyTransaction(entry, tx);
    byMonth.set(monthKey(tx.date), entry);
    byOperatorMonth.set(tx.operatorId, byMonth);
  }

  return operators.map((op) => {
    const byMonth = byOperatorMonth.get(op.id) ?? new Map<string, MonthTotals>();
    const salaryStartsFrom = op.joiningDate ?? op.createdAt;
    const carriedForward = carriedForwardBalance(op.defaultMonthlySalary, salaryStartsFrom, start, byMonth);
    const thisMonth = byMonth.get(monthKey(start)) ?? { bonus: 0, deductions: 0, paid: 0 };
    const payable =
      Math.round((op.defaultMonthlySalary + thisMonth.bonus - thisMonth.deductions - thisMonth.paid + carriedForward) * 100) / 100;
    return { operatorId: op.id, baseSalary: op.defaultMonthlySalary, bonus: Math.round(thisMonth.bonus * 100) / 100, payable };
  });
});

/** Sum of every operator's current-month remaining payable (already
 * includes any carried-forward balance from earlier months) — feeds the
 * Dashboard's "Operator Salary Due" card. */
export async function getTotalSalaryDue(businessId: string) {
  const now = new Date();
  const breakdown = await getSalaryBreakdownForMonth(businessId, now.getFullYear(), now.getMonth());

  let total = 0;
  for (const op of breakdown) {
    if (op.payable > 0) total += op.payable;
  }
  return Math.round(total * 100) / 100;
}
