import { Decimal, ZERO, round2 } from "@/lib/money";

// The pure salary arithmetic shared by salary.ts (live totals) and
// workingPeriods.ts (per-period totals). Nothing here touches the database.
// All arithmetic is exact (Decimal / NUMERIC) — see money.ts.

export type MonthTotals = { bonus: Decimal; deductions: Decimal; paid: Decimal };

export const emptyTotals = (): MonthTotals => ({ bonus: ZERO, deductions: ZERO, paid: ZERO });

/** Exact Decimal → the 2 dp number the API/UI works with. */
export const toMoney = (value: Decimal) => round2(value).toNumber();

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

/** Whether a transaction is one of the ones that make up `deductions`. Shared
 * with the "why was this deducted?" breakdown so the listed lines can never
 * add up to something other than the total shown beside them. */
export function isDeduction(tx: { businessEffect: string; deductFromSalary: boolean }) {
  return tx.businessEffect !== "SALARY_PAYMENT" && tx.businessEffect !== "BONUS_INCENTIVE" && tx.deductFromSalary;
}

/** SALARY_PAYMENT -> paid, BONUS_INCENTIVE -> bonus, anything else flagged
 * deductFromSalary -> deductions; deductFromSalary=false is ignored. */
export function applyTransaction(
  entry: MonthTotals,
  tx: { businessEffect: string; deductFromSalary: boolean; amount: Decimal },
) {
  if (tx.businessEffect === "SALARY_PAYMENT") entry.paid = entry.paid.plus(tx.amount);
  else if (tx.businessEffect === "BONUS_INCENTIVE") entry.bonus = entry.bonus.plus(tx.amount);
  else if (isDeduction(tx)) entry.deductions = entry.deductions.plus(tx.amount);
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
export type Accrual = {
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
 * Base salary earned from `joinDate` up to (not including) `asOf`, accrued day
 * by day instead of by whole calendar months: each complete anniversary cycle
 * (e.g. 7 Jun -> 7 Jul) counts as one full baseSalary; a cycle that hasn't
 * finished is prorated by the days elapsed into it over that cycle's own length
 * (28-31 days). A working period uses it with joinDate = period start and
 * asOf = (period end + 1 day) or today. Returns every intermediate figure so a
 * caller can show exactly how the number was reached.
 */
export function accrueBaseSalary(joinDate: Date, asOf: Date, baseSalary: Decimal): Accrual {
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

export function presentAccrual(accrual: Accrual): AccrualBreakdown {
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
