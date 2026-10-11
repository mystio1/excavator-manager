import { requireBusinessApi } from "@/lib/api-auth";
import { ApiHttpError, errorResponse, failureResponse } from "@/lib/api-error";
import { runIdempotent } from "@/lib/idempotency";
import { previewStartPeriod, startWorkingPeriod } from "@/lib/services/workingPeriodActions";
import { getOperatorPeriodsOverview } from "@/lib/services/workingPeriods";
import { previewStartSchema, startPeriodSchema } from "@/lib/validation/operatorPeriod";
import { json, parseBody, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string }> };

/** Working periods + leaves + timeline + the operator-level salary summary.
 * `?previewStart=YYYY-MM-DD[&previewEnd=YYYY-MM-DD]` instead returns the carry-forward preview for the
 * "Start New Working Period" dialog (the amount the server would carry at this moment). */
export const GET = withApi("operators.periods.list", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;
  const { searchParams } = new URL(req.url);

  if (searchParams.has("previewStart")) {
    const parsed = previewStartSchema.safeParse({
      previewStart: searchParams.get("previewStart"),
      previewEnd: searchParams.get("previewEnd") ?? undefined,
    });
    if (!parsed.success) throw new ApiHttpError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Select a valid date");
    const preview = await previewStartPeriod(auth.session.businessId, id, parsed.data.previewStart, parsed.data.previewEnd);
    if ("error" in preview) return failureResponse(preview);
    return json({ preview });
  }

  const overview = await getOperatorPeriodsOverview(auth.session.businessId, id);
  if (!overview) return errorResponse("NOT_FOUND", "Operator not found");
  return json(overview);
});

/** Start a new Working Period: closes the ACTIVE one, records the gap as a leave and (optionally) carries
 * the previous balance, all in one transaction. Money-like, so it honors an `Idempotency-Key`. */
export const POST = withApi("operators.periods.start", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { session, actor } = auth;
  const { id } = await params;

  const input = await parseBody(req, startPeriodSchema);

  return runIdempotent(
    { req, businessId: session.businessId, actorId: actor.id, operation: "operator.period.start", payload: { ...input, operatorId: id } },
    async (tx) => {
      const result = await startWorkingPeriod(session.businessId, actor, id, input, { tx });
      if ("error" in result) return { ok: false, failure: result };
      return {
        ok: true,
        status: 201,
        body: result,
        resourceType: "OperatorWorkingPeriod",
        resourceId: result.period.id,
      };
    },
  );
});
