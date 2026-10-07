import { requireBusinessApi } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-error";
import { operatorInBusiness } from "@/lib/services/operators";
import { runIdempotent } from "@/lib/idempotency";
import { parsePagination } from "@/lib/pagination";
import { createTransaction, listTransactionsPage } from "@/lib/services/operatorTransactions";
import { createTransactionBodySchema } from "@/lib/validation/operatorTransaction";
import { json, parseBody, withApi } from "@/lib/with-api";

export const GET = withApi("operators.transactions.list", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  if (!(await operatorInBusiness(auth.session.businessId, id))) return errorResponse("NOT_FOUND", "Operator not found");

  const page = await listTransactionsPage(auth.session.businessId, id, parsePagination(req));
  return json({ transactions: page.items, nextCursor: page.nextCursor });
});

/** Money record: honors an `Idempotency-Key` header so a retry after a lost
 * response replays the first result instead of creating a second transaction.
 * Requests without the header (older apps) behave exactly as before. */
export const POST = withApi("operator.transaction.create", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { session, actor } = auth;
  const { id } = await params;

  // The operator always comes from the URL, never the body.
  const input = { ...(await parseBody(req, createTransactionBodySchema)), operatorId: id };

  return runIdempotent(
    { req, businessId: session.businessId, actorId: actor.id, operation: "operator.transaction.create", payload: input },
    async (tx) => {
      const result = await createTransaction(session.businessId, actor, input, { tx });
      if ("error" in result) return { ok: false, failure: result };
      return {
        ok: true,
        status: 201,
        body: { ok: true, transaction: result },
        resourceType: "OperatorTransaction",
        resourceId: result.id,
      };
    },
  );
});
