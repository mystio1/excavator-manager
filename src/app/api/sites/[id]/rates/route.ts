import { failureResponse } from "@/lib/api-error";
import { requireBusinessApi } from "@/lib/api-auth";
import { updateSiteRates } from "@/lib/services/sites";
import { updateSiteRatesSchema } from "@/lib/validation/site";
import { json, parseBody, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string }> };

/** Change the site's bucket / breaker (Brekar) rates from `effectiveFrom` (default today). Earlier work
 * keeps the rate in force on its date; bills are never touched. Versioned + audited. */
export const PATCH = withApi("sites.rates", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;
  const input = await parseBody(req, updateSiteRatesSchema);
  const result = await updateSiteRates(auth.session.businessId, auth.actor, id, input);
  if ("error" in result) return failureResponse(result);
  return json({ ok: true, site: result.site });
});
