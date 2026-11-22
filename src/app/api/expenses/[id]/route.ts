import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { deleteExpense } from "@/lib/services/expenses";
import { json, withApi } from "@/lib/with-api";

export const DELETE = withApi("expenses.delete", async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;
  const result = await deleteExpense(auth.session.businessId, auth.actor, id);
  if ("error" in result) return failureResponse(result);
  return json(result);
});
