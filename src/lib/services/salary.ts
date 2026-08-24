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

/** Sum of every operator's current-month remaining payable — feeds the
 * Dashboard's "Operator Salary Due" card. */
export async function getTotalSalaryDue(businessId: string) {
  const now = new Date();
  const operators = await db.operator.findMany({ where: { businessId, isArchived: false }, select: { id: true } });

  let total = 0;
  for (const op of operators) {
    const { payable } = await computeSalaryForMonth(businessId, op.id, now.getFullYear(), now.getMonth());
    if (payable > 0) total += payable;
  }
  return Math.round(total * 100) / 100;
}
