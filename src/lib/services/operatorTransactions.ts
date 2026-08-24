import { db } from "@/lib/db";
import { DEFAULT_TRANSACTION_CATEGORIES, type AddTransactionInput } from "@/lib/validation/operatorTransaction";

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

/** Every transaction *is* the business financial record — no separate
 * expense row to keep in sync (see the OperatorTransaction schema comment).
 * A category typed via "+ Add Custom Category" is created once and reused. */
export async function createTransaction(businessId: string, input: AddTransactionInput) {
  let categoryId = input.categoryId || null;

  if (!categoryId && input.newCategoryName) {
    const existing = await db.transactionCategory.findFirst({
      where: { businessId, name: { equals: input.newCategoryName } },
    });
    const category =
      existing ?? (await db.transactionCategory.create({ data: { businessId, name: input.newCategoryName } }));
    categoryId = category.id;
  }

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

export async function listRecentTransactionsForBusiness(businessId: string, limit = 10) {
  return db.operatorTransaction.findMany({
    where: { businessId },
    orderBy: { date: "desc" },
    take: limit,
    include: { operator: { select: { name: true } }, category: { select: { name: true } } },
  });
}
