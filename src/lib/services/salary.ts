import { cache } from "react";
import { db } from "@/lib/db";

/**
 * Salary is never stored or hand-calculated — it's computed live from the
 * operator's base salary plus every transaction dated within the given
 * calendar month, per spec §5:
 *
 *   Final Salary Payable = Base Salary + Bonuses/Incentives
 *                           - Deductible Transactions - Salary Already Paid
 *
 * Nothing here is summed twice: a transaction contributes to exactly one of
 * bonus/deduction/paid based on its own businessEffect/deductFromSalary
 * fields, so there's no separate "applied" flag that could desync.
 */
export async function computeSalaryForMonth(businessId: string, operatorId: string, year: number, month: number) {
  const operator = await db.operator.findFirstOrThrow({ where: { id: operatorId, businessId } });

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  const transactions = await db.operatorTransaction.findMany({
    where: { businessId, operatorId, date: { gte: start, lt: end } },
    orderBy: { date: "asc" },
    include: { category: { select: { name: true } } },
  });

  let bonus = 0;
  let deductions = 0;
  let alreadyPaid = 0;

  for (const tx of transactions) {
    if (tx.businessEffect === "SALARY_PAYMENT") {
      alreadyPaid += tx.amount;
    } else if (tx.businessEffect === "BONUS_INCENTIVE") {
      bonus += tx.amount;
    } else if (tx.deductFromSalary) {
      deductions += tx.amount;
    }
  }

  const baseSalary = operator.defaultMonthlySalary;
  const payable = Math.round((baseSalary + bonus - deductions - alreadyPaid) * 100) / 100;

  return {
    operatorName: operator.name,
    baseSalary,
    bonus: Math.round(bonus * 100) / 100,
    deductions: Math.round(deductions * 100) / 100,
    alreadyPaid: Math.round(alreadyPaid * 100) / 100,
    payable,
    transactions,
  };
}

/**
 * Same math as computeSalaryForMonth, for every operator in the business at
 * once — 2 queries total instead of 2 per operator. getTotalSalaryDue and
 * getProfitOverview both need this same per-operator breakdown for the
 * current month; originally each called computeSalaryForMonth in its own
 * sequential per-operator loop (2N chained round-trips, doubled since both
 * ran it independently). cache()'d so the two callers, invoked concurrently
 * from the dashboard's top-level Promise.all, share one computation instead
 * of running it twice.
 */
export const getSalaryBreakdownForMonth = cache(async function getSalaryBreakdownForMonth(
  businessId: string,
  year: number,
  month: number,
) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  const [operators, transactions] = await Promise.all([
    db.operator.findMany({
      where: { businessId, isArchived: false },
      select: { id: true, defaultMonthlySalary: true },
    }),
    db.operatorTransaction.findMany({
      where: { businessId, date: { gte: start, lt: end } },
      select: { operatorId: true, amount: true, businessEffect: true, deductFromSalary: true },
    }),
  ]);

  const byOperator = new Map<string, { bonus: number; deductions: number; alreadyPaid: number }>();
  for (const tx of transactions) {
    const entry = byOperator.get(tx.operatorId) ?? { bonus: 0, deductions: 0, alreadyPaid: 0 };
    if (tx.businessEffect === "SALARY_PAYMENT") entry.alreadyPaid += tx.amount;
    else if (tx.businessEffect === "BONUS_INCENTIVE") entry.bonus += tx.amount;
    else if (tx.deductFromSalary) entry.deductions += tx.amount;
    byOperator.set(tx.operatorId, entry);
  }

  return operators.map((op) => {
    const { bonus, deductions, alreadyPaid } = byOperator.get(op.id) ?? { bonus: 0, deductions: 0, alreadyPaid: 0 };
    const payable = Math.round((op.defaultMonthlySalary + bonus - deductions - alreadyPaid) * 100) / 100;
    return { operatorId: op.id, baseSalary: op.defaultMonthlySalary, bonus, payable };
  });
});

/** Sum of every operator's current-month remaining payable — feeds the
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
