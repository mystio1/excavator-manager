import { errorResponse } from "@/lib/api-error";
import { requireBusinessApi } from "@/lib/api-auth";
import { getCustomerDetail } from "@/lib/services/customers";
import { customerDetailQuerySchema } from "@/lib/validation/customer";
import { json, withApi } from "@/lib/with-api";

export const GET = withApi("customers.detail", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const params = new URL(req.url).searchParams;
  const query = customerDetailQuerySchema.parse({
    id: params.get("id") ?? undefined,
    excavatorId: params.get("excavatorId") ?? undefined,
    site: params.get("site") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });

  const detail = await getCustomerDetail(auth.session.businessId, query.id, {
    excavatorId: query.excavatorId,
    siteName: query.site,
    from: query.from,
    to: query.to,
  });
  if (!detail) return errorResponse("NOT_FOUND", "Customer not found");

  return json({ detail });
});
