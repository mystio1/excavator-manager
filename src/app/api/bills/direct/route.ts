import { requireBusinessApi } from "@/lib/api-auth";
import { runIdempotent } from "@/lib/idempotency";
import { createDirectBill } from "@/lib/services/bills";
import { generateDirectBillSchema } from "@/lib/validation/directBill";
import { parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("bills.direct.create", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const input = await parseBody(req, generateDirectBillSchema);

  return runIdempotent(
    { req, businessId, actorId: auth.actor.id, operation: "bill.direct.create", payload: input },
    async (tx) => {
      const result = await createDirectBill(businessId, auth.actor, input, { tx });
      if ("error" in result) return { ok: false, failure: result };
      return { ok: true, status: 201, body: result, resourceType: "Bill", resourceId: result.bill.id };
    },
  );
});
