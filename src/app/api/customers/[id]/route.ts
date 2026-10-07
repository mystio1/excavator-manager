import { failureResponse } from "@/lib/api-error";
import { requireBusinessApi } from "@/lib/api-auth";
import { archiveCustomer, updateCustomer } from "@/lib/services/customers";
import { updateCustomerSchema } from "@/lib/validation/customer";
import { json, parseBody, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string }> };

/** Edit a customer. Send `expectedVersion` (the `version` you loaded) to be
 * refused with 409 RESOURCE_MODIFIED instead of overwriting someone else's edit. */
export const PATCH = withApi("customers.update", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const { expectedVersion, ...input } = await parseBody(req, updateCustomerSchema);
  const result = await updateCustomer(auth.session.businessId, auth.actor, id, input, { expectedVersion });
  if ("error" in result) return failureResponse(result);
  return json({ ok: true, customer: result.customer });
});

/** Archives (hides) the customer — history and bills are kept. */
export const DELETE = withApi("customers.archive", async (_req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await archiveCustomer(auth.session.businessId, auth.actor, id);
  if ("error" in result) return failureResponse(result);
  return json({ ok: true });
});
