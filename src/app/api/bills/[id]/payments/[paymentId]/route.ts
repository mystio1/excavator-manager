import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { deletePayment, updatePayment } from "@/lib/services/bills";
import { parseExpectedVersion, updatePaymentSchema } from "@/lib/validation/bill";
import { json, parseBody, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

export const PATCH = withApi("bills.payments.update", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id, paymentId } = await params;

  const input = await parseBody(req, updatePaymentSchema);
  const result = await updatePayment(auth.session.businessId, auth.actor, { billId: id, paymentId, ...input });
  if ("error" in result) return failureResponse(result);
  return json(result);
});

export const DELETE = withApi("bills.payments.delete", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id, paymentId } = await params;

  const result = await deletePayment(auth.session.businessId, auth.actor, id, paymentId, {
    expectedVersion: parseExpectedVersion(req),
  });
  if ("error" in result) return failureResponse(result);
  return json(result);
});
