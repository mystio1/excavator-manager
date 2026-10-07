import { requireBusinessApi } from "@/lib/api-auth";
import { parsePagination } from "@/lib/pagination";
import { createCustomer, listCustomers } from "@/lib/services/customers";
import { addCustomerSchema, customerListQuerySchema } from "@/lib/validation/customer";
import { json, parseBody, withApi } from "@/lib/with-api";

/** Customers list. Cursor-paginated (name A-Z, id as tie-breaker):
 * `?limit=50&cursor=<nextCursor>` → `{ customers, nextCursor, summary }`.
 * `summary` (totals over the whole filtered list) comes with the first page
 * only. Without `limit` (older apps) a bounded page of 200 is returned. */
export const GET = withApi("customers.list", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const params = new URL(req.url).searchParams;
  const { q, tripDate } = customerListQuerySchema.parse({
    q: params.get("q") ?? undefined,
    tripDate: params.get("tripDate") ?? undefined,
  });
  const page = parsePagination(req);

  return json(await listCustomers(auth.session.businessId, q, tripDate, page));
});

export const POST = withApi("customers.create", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const input = await parseBody(req, addCustomerSchema);
  const customer = await createCustomer(auth.session.businessId, auth.actor, input);
  return json({ customer });
});
