import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { createExpense, listExpenses } from "@/lib/services/expenses";
import { listExcavatorOptions } from "@/lib/services/excavators";
import { createExpenseSchema, expenseListQuerySchema } from "@/lib/validation/expense";
import { json, parseBody, withApi } from "@/lib/with-api";

/** Expenses list (latest 200, optionally filtered) plus the machine options for the form. */
export const GET = withApi("expenses.list", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const q = expenseListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const [expenses, excavators] = await Promise.all([
    listExpenses(auth.session.businessId, q),
    listExcavatorOptions(auth.session.businessId),
  ]);
  return json({ expenses, excavators });
});

export const POST = withApi("expenses.create", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const input = await parseBody(req, createExpenseSchema);
  const result = await createExpense(auth.session.businessId, auth.actor, input);
  if ("error" in result) return failureResponse(result);
  return json(result);
});
