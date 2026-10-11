import { requireBusinessApi } from "@/lib/api-auth";
import { errorResponse, failureResponse } from "@/lib/api-error";
import { operatorInBusiness } from "@/lib/services/operators";
import { createLeave, listLeaves } from "@/lib/services/workingPeriodActions";
import { createLeaveSchema } from "@/lib/validation/operatorPeriod";
import { json, parseBody, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi("operators.leaves.list", async (_req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!(await operatorInBusiness(auth.session.businessId, id))) return errorResponse("NOT_FOUND", "Operator not found");
  return json({ leaves: await listLeaves(auth.session.businessId, id) });
});

/** Record a leave (a gap between two working periods). Unpaid leave accrues nothing. */
export const POST = withApi("operators.leaves.create", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const input = await parseBody(req, createLeaveSchema);
  const result = await createLeave(auth.session.businessId, auth.actor, id, input);
  if ("error" in result) return failureResponse(result);
  return json(result, { status: 201 });
});
