import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { deleteLeave } from "@/lib/services/workingPeriodActions";
import { json, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string; leaveId: string }> };

export const DELETE = withApi("operators.leaves.delete", async (_req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id, leaveId } = await params;

  const result = await deleteLeave(auth.session.businessId, auth.actor, id, leaveId);
  if ("error" in result) return failureResponse(result);
  return json({ ok: true });
});
