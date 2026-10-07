import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { deleteTransaction, updateTransaction } from "@/lib/services/operatorTransactions";
import { updateTransactionSchema } from "@/lib/validation/operatorTransaction";
import { json, parseBody, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string; transactionId: string }> };

export const PATCH = withApi("operator.transaction.update", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id, transactionId } = await params;

  const input = await parseBody(req, updateTransactionSchema);
  const result = await updateTransaction(auth.session.businessId, auth.actor, transactionId, input, { operatorId: id });
  if ("error" in result) return failureResponse(result);

  return json({ ok: true, transaction: result });
});

export const DELETE = withApi("operator.transaction.delete", async (_req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id, transactionId } = await params;

  const result = await deleteTransaction(auth.session.businessId, auth.actor, transactionId, { operatorId: id });
  if ("error" in result) return failureResponse(result);

  return json({ ok: true });
});
