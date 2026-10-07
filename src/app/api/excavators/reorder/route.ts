import { z } from "zod";
import { requireBusinessApi } from "@/lib/api-auth";
import { json, parseBody, withApi } from "@/lib/with-api";
import { reorderExcavators } from "@/lib/services/excavators";

const schema = z.object({ orderedIds: z.array(z.string().min(1)).min(1).max(500) });

/** The service only ever touches machines that belong to this business: ids of
 * other tenants (or unknown ids) are ignored, never read or written. */
export const PUT = withApi("excavators.reorder", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const { orderedIds } = await parseBody(req, schema);
  await reorderExcavators(auth.session.businessId, orderedIds);
  return json({ ok: true });
});
