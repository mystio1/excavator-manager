import { db } from "@/lib/db";
import {
  DEFAULT_TRANSACTION_CATEGORIES,
  type AddTransactionInput,
  type UpdateTransactionInput,
} from "@/lib/validation/operatorTransaction";

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

export async function listTransactions(businessId: string, operatorId: string) {
  return db.operatorTransaction.findMany({
    where: { businessId, operatorId },
    orderBy: { date: "desc" },
    include: { category: { select: { name: true } } },
  });
}

// A category typed via "+ Add Custom Category" is created once and reused
// on any later transaction (add or edit) that picks the same name.
async function resolveCategoryId(businessId: string, categoryId: string | undefined, newCategoryName: string | undefined) {
  if (categoryId) return categoryId;
  if (!newCategoryName) return null;

  const existing = await db.transactionCategory.findFirst({
    where: { businessId, name: { equals: newCategoryName } },
  });
  const category = existing ?? (await db.transactionCategory.create({ data: { businessId, name: newCategoryName } }));
  return category.id;
}

/** Every transaction *is* the business financial record — no separate
 * expense row to keep in sync (see the OperatorTransaction schema comment). */
export async function createTransaction(businessId: string, input: AddTransactionInput) {
  const categoryId = await resolveCategoryId(businessId, input.categoryId, input.newCategoryName);

  return db.operatorTransaction.create({
    data: {
      businessId,
      operatorId: input.operatorId,
      categoryId,
      amount: input.amount,
      date: new Date(input.date),
      notes: input.notes || null,
      deductFromSalary: input.deductFromSalary ?? true,
      businessEffect: input.businessEffect,
    },
  });
}

export async function updateTransaction(businessId: string, transactionId: string, input: UpdateTransactionInput) {
  const categoryId = await resolveCategoryId(businessId, input.categoryId, input.newCategoryName);

  return db.operatorTransaction.updateMany({
    where: { id: transactionId, businessId },
    data: {
      categoryId,
      amount: input.amount,
      date: new Date(input.date),
      notes: input.notes || null,
      deductFromSalary: input.deductFromSalary ?? true,
      businessEffect: input.businessEffect,
    },
  });
}

export async function deleteTransaction(businessId: string, transactionId: string) {
  return db.operatorTransaction.deleteMany({ where: { id: transactionId, businessId } });
}

export async function listRecentTransactionsForBusiness(businessId: string, limit = 10) {
  return db.operatorTransaction.findMany({
    where: { businessId },
    orderBy: { date: "desc" },
    take: limit,
    include: { operator: { select: { name: true } }, category: { select: { name: true } } },
  });
}
