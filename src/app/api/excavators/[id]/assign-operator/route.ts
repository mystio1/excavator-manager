import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { assignOperator, endOperatorAssignment } from "@/lib/services/operatorAssignments";
import { assignOperatorBodySchema } from "@/lib/validation/operatorAssignment";
import { json, parseBody, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withApi("excavator.assignOperator", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  // The machine always comes from the URL, never the body.
  const body = await parseBody(req, assignOperatorBodySchema);
  const result = await assignOperator(auth.session.businessId, auth.actor, { excavatorId: id, operatorId: body.operatorId });
  if ("error" in result) return failureResponse(result);

  return json({ ok: true });
});

export const DELETE = withApi("excavator.endOperatorAssignment", async (_req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await endOperatorAssignment(auth.session.businessId, auth.actor, id);
  if ("error" in result) return failureResponse(result);

  return json({ ok: true });
});
