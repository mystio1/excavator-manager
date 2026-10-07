import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { json, parseBody, withApi } from "@/lib/with-api";
import { deleteWorkSession, updateWorkSession } from "@/lib/services/workSessions";
import { expectedVersionFromQuery, updateWorkSessionSchema } from "@/lib/validation/workSession";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApi("workSessions.update", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const input = await parseBody(req, updateWorkSessionSchema);
  const result = await updateWorkSession(auth.session.businessId, auth.actor, id, input);
  if ("error" in result) return failureResponse(result);
  return json(result);
});

export const DELETE = withApi("workSessions.delete", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await deleteWorkSession(auth.session.businessId, auth.actor, id, {
    expectedVersion: expectedVersionFromQuery(req),
  });
  if ("error" in result) return failureResponse(result);
  return json(result);
});
