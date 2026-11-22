import { db } from "@/lib/db";
import { fail } from "@/lib/api-error";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { withTx, type Tx } from "@/lib/tx";
import { lockOwnedExcavator } from "@/lib/services/workSessions";
import type { CreateExpenseInput, ExpenseListQuery } from "@/lib/validation/expense";

/**
 * Money actually spent on a machine: diesel bought, repairs, parts, tyres, transport, other.
 * Business Profit Overview counts these as expenses; a machine's recorded DIESEL purchases
 * replace "litres x diesel price" for that machine in the period (see getProfitOverview).
 */

export async function listExpenses(businessId: string, q: ExpenseListQuery = {}) {
  return db.excavatorExpense.findMany({
    where: {
      businessId,
      ...(q.excavatorId ? { excavatorId: q.excavatorId } : {}),
      ...(q.from || q.to
        ? { date: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) } }
        : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      date: true,
      type: true,
      amount: true,
      notes: true,
      excavator: { select: { id: true, name: true, machineNumber: true } },
    },
  });
}

export async function createExpense(businessId: string, actor: AuditActor, input: CreateExpenseInput, opts?: { tx?: Tx }) {
  return withTx(opts?.tx, async (tx) => {
    if (!(await lockOwnedExcavator(tx, businessId, input.excavatorId))) return fail("NOT_FOUND", "Machine not found");
    const expense = await tx.excavatorExpense.create({
      data: {
        businessId,
        excavatorId: input.excavatorId,
        date: new Date(`${input.date}T00:00:00.000Z`),
        type: input.type,
        amount: round2(input.amount),
        notes: input.notes || null,
      },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "expense.create",
      entityType: "ExcavatorExpense",
      entityId: expense.id,
      after: expense,
    });
    return { expense } as const;
  });
}

export async function deleteExpense(businessId: string, actor: AuditActor, id: string, opts?: { tx?: Tx }) {
  return withTx(opts?.tx, async (tx) => {
    const before = await tx.excavatorExpense.findFirst({ where: { id, businessId } });
    if (!before) return fail("NOT_FOUND", "Expense not found");
    await tx.excavatorExpense.delete({ where: { id } });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "expense.delete",
      entityType: "ExcavatorExpense",
      entityId: id,
      before,
    });
    return { ok: true } as const;
  });
}
