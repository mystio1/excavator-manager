import { requireBusinessApi } from "@/lib/api-auth";
import { errorResponse, failureResponse } from "@/lib/api-error";
import { json, parseBody, withApi } from "@/lib/with-api";
import { archiveExcavator, getExcavatorDetail, updateExcavator } from "@/lib/services/excavators";
import { listSiteOptions } from "@/lib/services/sites";
import { editExcavatorSchema } from "@/lib/validation/excavator";
import { expectedVersionFromQuery } from "@/lib/validation/workSession";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi("excavators.get", async (_req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const [detail, siteOptions] = await Promise.all([
    getExcavatorDetail(auth.session.businessId, id),
    listSiteOptions(auth.session.businessId),
  ]);
  if (!detail) return errorResponse("NOT_FOUND", "Machine not found");

  return json({ detail, siteOptions });
});

export const PATCH = withApi("excavators.update", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const input = await parseBody(req, editExcavatorSchema);
  const result = await updateExcavator(auth.session.businessId, auth.actor, id, input);
  if ("error" in result) return failureResponse(result);
  return json(result);
});

export const DELETE = withApi("excavators.archive", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await archiveExcavator(auth.session.businessId, auth.actor, id, {
    expectedVersion: expectedVersionFromQuery(req),
  });
  if ("error" in result) return failureResponse(result);
  return json({ ok: true });
});
