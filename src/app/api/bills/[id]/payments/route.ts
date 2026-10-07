import { requireBusinessApi } from "@/lib/api-auth";
import { runIdempotent } from "@/lib/idempotency";
import { addPayment } from "@/lib/services/bills";
import { addPaymentSchema } from "@/lib/validation/bill";
import { parseBody, withApi } from "@/lib/with-api";

// The bill id comes from the URL, never from the body.
const bodySchema = addPaymentSchema.omit({ billId: true });

export const POST = withApi("bills.payments.create", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;
  const { id } = await params;

  const input = { ...(await parseBody(req, bodySchema)), billId: id };

  // A retried "Save Payment" (lost response, double tap) must not record the
  // same money twice: the Idempotency-Key replays the first outcome.
  return runIdempotent(
    { req, businessId, actorId: auth.actor.id, operation: "payment.create", payload: input },
    async (tx) => {
      const result = await addPayment(businessId, auth.actor, input, { tx });
      if ("error" in result) return { ok: false, failure: result };
      return { ok: true, status: 201, body: result, resourceType: "Payment", resourceId: result.payment.id };
    },
  );
});
