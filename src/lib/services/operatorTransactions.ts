import { db } from "@/lib/db";
import { fail, type ServiceFailure } from "@/lib/api-error";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { LEGACY_LIMIT, pageArgs, toPage, type PageParams } from "@/lib/pagination";
import { isStale, resourceModified, withTx, type Tx } from "@/lib/tx";
import {
  DEFAULT_TRANSACTION_CATEGORIES,
  type AddTransactionInput,
  type UpdateTransactionInput,
} from "@/lib/validation/operatorTransaction";

const WITH_CATEGORY = { category: { select: { name: true } } } as const;

export async function listCategories(businessId: string) {
  return db.transactionCategory.findMany({
    where: { businessId },
    orderBy: { name: "asc" },
  });
}

export async function seedDefaultCategories(businessId: string) {
  await db.transactionCategory.createMany({
    data: DEFAULT_TRANSACTION_CATEGORIES.map((name) => ({ businessId, name, isDefault: true })),
  });
}

/** One page of an operator's transactions, newest first (stable order: date,
 * then id). */
export async function listTransactionsPage(businessId: string, operatorId: string, page: PageParams) {
  const rows = await db.operatorTransaction.findMany({
    where: { businessId, operatorId },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    include: WITH_CATEGORY,
    ...pageArgs(page),
  });
  return toPage(rows, page.limit);
}

/** Legacy shape (a plain array) — bounded to the first LEGACY_LIMIT rows, never
 * unbounded. Callers that can page use listTransactionsPage. */
export async function listTransactions(businessId: string, operatorId: string) {
  const { items } = await listTransactionsPage(businessId, operatorId, { limit: LEGACY_LIMIT, cursor: undefined });
  return items;
}

/** Serializes writers of one transaction row (SELECT … FOR UPDATE) so the
 * before-snapshot, the version check and the write all see the same row. */
async function lockOperatorTransaction(tx: Tx, businessId: string, transactionId: string) {
  await tx.$queryRaw`SELECT 1 FROM "OperatorTransaction" WHERE "id" = ${transactionId} AND "businessId" = ${businessId} FOR UPDATE`;
}

// A category typed via "+ Add Custom Category" is created once and reused
// on any later transaction (add or edit) that picks the same name. A picked
// category must belong to THIS business — an id from another tenant is "not
// found", never silently attached.
async function resolveCategoryId(
  tx: Tx,
  businessId: string,
  categoryId: string | undefined,
  newCategoryName: string | undefined,
): Promise<{ categoryId: string | null } | ServiceFailure> {
  if (categoryId) {
    const picked = await tx.transactionCategory.findFirst({ where: { id: categoryId, businessId }, select: { id: true } });
    return picked ? { categoryId: picked.id } : fail("NOT_FOUND", "Category not found");
  }
  const name = newCategoryName?.trim();
  if (!name) return { categoryId: null };

  // Two concurrent requests creating the same new category (a double tap, a
  // retry) would otherwise both miss it and insert twice.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${businessId}:txcat:${name.toLowerCase()}`}, 0))`;
  const existing = await tx.transactionCategory.findFirst({
    where: { businessId, name: { equals: name, mode: "insensitive" } },
  });
  const category = existing ?? (await tx.transactionCategory.create({ data: { businessId, name } }));
  return { categoryId: category.id };
}

/** Every transaction *is* the business financial record — no separate
 * expense row to keep in sync (see the OperatorTransaction schema comment).
 * The amount is stored exactly (NUMERIC); the audit entry commits in the same
 * transaction as the row. */
export async function createTransaction(
  businessId: string,
  actor: AuditActor,
  input: AddTransactionInput,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    const operator = await tx.operator.findFirst({
      where: { id: input.operatorId, businessId },
      select: { id: true },
    });
    if (!operator) return fail("NOT_FOUND", "Operator not found");

    const category = await resolveCategoryId(tx, businessId, input.categoryId, input.newCategoryName);
    if ("error" in category) return category;

    const created = await tx.operatorTransaction.create({
      data: {
        businessId,
        operatorId: operator.id,
        categoryId: category.categoryId,
        amount: round2(input.amount),
        date: new Date(input.date),
        notes: input.notes || null,
        deductFromSalary: input.deductFromSalary ?? true,
        businessEffect: input.businessEffect,
      },
      include: WITH_CATEGORY,
    });

    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.transaction.create",
      entityType: "OperatorTransaction",
      entityId: created.id,
      after: created,
      details: { operatorId: operator.id },
    });
    return created;
  });
}

/** `opts.operatorId`, when given (the routes always pass the URL's operator),
 * must match the transaction's operator — a mismatched pair is "not found". */
export async function updateTransaction(
  businessId: string,
  actor: AuditActor,
  transactionId: string,
  input: UpdateTransactionInput,
  opts?: { tx?: Tx; operatorId?: string },
) {
  return withTx(opts?.tx, async (tx) => {
    await lockOperatorTransaction(tx, businessId, transactionId);
    const before = await tx.operatorTransaction.findFirst({
      where: { id: transactionId, businessId, ...(opts?.operatorId ? { operatorId: opts.operatorId } : {}) },
      include: WITH_CATEGORY,
    });
    if (!before) return fail("NOT_FOUND", "Transaction not found");
    if (isStale(before.version, input.expectedVersion)) return resourceModified("transaction");

    const category = await resolveCategoryId(tx, businessId, input.categoryId, input.newCategoryName);
    if ("error" in category) return category;

    const after = await tx.operatorTransaction.update({
      where: { id: before.id },
      data: {
        categoryId: category.categoryId,
        amount: round2(input.amount),
        date: new Date(input.date),
        notes: input.notes || null,
        deductFromSalary: input.deductFromSalary ?? true,
        businessEffect: input.businessEffect,
        version: { increment: 1 },
      },
      include: WITH_CATEGORY,
    });

    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.transaction.update",
      entityType: "OperatorTransaction",
      entityId: after.id,
      before,
      after,
      details: { operatorId: after.operatorId },
    });
    return after;
  });
}

export async function deleteTransaction(
  businessId: string,
  actor: AuditActor,
  transactionId: string,
  opts?: { tx?: Tx; operatorId?: string },
) {
  return withTx(opts?.tx, async (tx) => {
    await lockOperatorTransaction(tx, businessId, transactionId);
    const before = await tx.operatorTransaction.findFirst({
      where: { id: transactionId, businessId, ...(opts?.operatorId ? { operatorId: opts.operatorId } : {}) },
      include: WITH_CATEGORY,
    });
    if (!before) return fail("NOT_FOUND", "Transaction not found");

    await tx.operatorTransaction.delete({ where: { id: before.id } });

    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.transaction.delete",
      entityType: "OperatorTransaction",
      entityId: before.id,
      before,
      details: { operatorId: before.operatorId },
    });
    return { ok: true, id: before.id } as const;
  });
}

export async function listRecentTransactionsForBusiness(businessId: string, limit = 10) {
  return db.operatorTransaction.findMany({
    where: { businessId },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: limit,
    include: { operator: { select: { name: true } }, category: { select: { name: true } } },
  });
}
