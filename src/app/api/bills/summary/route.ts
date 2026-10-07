import { requireBusinessApi } from "@/lib/api-auth";
import { runIdempotent } from "@/lib/idempotency";
import { createSummaryBill } from "@/lib/services/bills";
import { generateSummaryBillSchema } from "@/lib/validation/bill";
import { parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("bills.summary.create", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const input = await parseBody(req, generateSummaryBillSchema);

  return runIdempotent(
    { req, businessId, actorId: auth.actor.id, operation: "bill.summary.create", payload: input },
    async (tx) => {
      const result = await createSummaryBill(businessId, auth.actor, input, { tx });
      if ("error" in result) return { ok: false, failure: result };
      return { ok: true, status: 201, body: result, resourceType: "Bill", resourceId: result.bill.id };
    },
  );
});
