import { requireBusinessApi } from "@/lib/api-auth";
import { CUSTOMER_OPTIONS_MAX, listCustomerOptions } from "@/lib/services/customers";
import { json, withApi } from "@/lib/with-api";

/** Complete (unpaginated) customer list for dropdowns — name A-Z, bounded to
 * CUSTOMER_OPTIONS_MAX (1000) rows; `truncated: true` means the cap was hit
 * and the list is not the whole customer base. The paginated, searchable list
 * is GET /api/customers. */
export const GET = withApi("customers.options", async () => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const customers = await listCustomerOptions(auth.session.businessId);
  return json({ customers, truncated: customers.length >= CUSTOMER_OPTIONS_MAX });
});
