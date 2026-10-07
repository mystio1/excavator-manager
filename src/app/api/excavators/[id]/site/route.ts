import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { json, parseBody, withApi } from "@/lib/with-api";
import { setExcavatorSite } from "@/lib/services/excavators";
import { setExcavatorSiteSchema } from "@/lib/validation/excavator";

// The machine comes from the URL, never from the body.
const bodySchema = setExcavatorSiteSchema.omit({ excavatorId: true });

export const PATCH = withApi("excavators.setSite", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const { siteName } = await parseBody(req, bodySchema);
  const result = await setExcavatorSite(auth.session.businessId, auth.actor, id, siteName);
  if ("error" in result) return failureResponse(result);

  return json({ ok: true });
});
