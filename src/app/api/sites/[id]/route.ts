import { ApiHttpError, failureResponse } from "@/lib/api-error";
import { requireBusinessApi } from "@/lib/api-auth";
import { getSiteAnalysis } from "@/lib/services/siteAnalysis";
import { updateSite } from "@/lib/services/sites";
import { updateSiteSchema } from "@/lib/validation/site";
import { json, parseBody, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string }> };

/** One site with its all-time summary (see /analysis for the filtered view). 404 for another tenant's id. */
export const GET = withApi("sites.get", async (_req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;
  const analysis = await getSiteAnalysis(auth.session.businessId, id);
  if (!analysis) throw new ApiHttpError("NOT_FOUND", "Site not found");
  return json(analysis);
});

/** Edit a site's basics (name, location, status, type, customer). Send `expectedVersion` to be
 * refused with 409 RESOURCE_MODIFIED instead of overwriting someone else's edit. */
export const PATCH = withApi("sites.update", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;
  const { expectedVersion, ...input } = await parseBody(req, updateSiteSchema);
  const result = await updateSite(auth.session.businessId, auth.actor, id, { ...input, expectedVersion });
  if ("error" in result) return failureResponse(result);
  return json({ ok: true, site: result.site });
});
