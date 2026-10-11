import { requireBusinessApi } from "@/lib/api-auth";
import { errorResponse, failureResponse } from "@/lib/api-error";
import { updateWorkingPeriod } from "@/lib/services/workingPeriodActions";
import { getPeriodDetails } from "@/lib/services/workingPeriods";
import { updatePeriodSchema } from "@/lib/validation/operatorPeriod";
import { json, parseBody, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string; periodId: string }> };

/** Session details: the period's figures plus its lines (accrual, previous balance, transactions). */
export const GET = withApi("operators.periods.get", async (_req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id, periodId } = await params;

  const details = await getPeriodDetails(auth.session.businessId, id, periodId);
  if (!details) return errorResponse("NOT_FOUND", "Working period not found");
  return json(details);
});

/** Edit notes, close the active period (`close: true`), or (with safeguards) change its dates. */
export const PATCH = withApi("operators.periods.update", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id, periodId } = await params;

  const input = await parseBody(req, updatePeriodSchema);
  const result = await updateWorkingPeriod(auth.session.businessId, auth.actor, id, periodId, input);
  if ("error" in result) return failureResponse(result);
  return json(result);
});
