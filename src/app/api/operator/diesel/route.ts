import { requireOperatorApi } from "@/lib/api-auth";
import { runIdempotent } from "@/lib/idempotency";
import { submitDieselOnly } from "@/lib/services/workSessions";
import { dieselOnlySchema } from "@/lib/validation/workSession";
import { parseBody, withApi } from "@/lib/with-api";

/** Operator "Diesel only": diesel taken with no work to report. Lands as a
 * PENDING diesel-only reading on the machine's job (see submitDieselOnly).
 * Honors an `Idempotency-Key` header so a retry after a lost response replays
 * the first result instead of recording the diesel twice. */
export const POST = withApi("operator.diesel.submit", async (req) => {
  const auth = await requireOperatorApi();
  if (auth.error) return auth.error;
  const { businessId, operatorId } = auth.session;

  const input = await parseBody(req, dieselOnlySchema);
  return runIdempotent(
    { req, businessId, actorId: operatorId, operation: "operator.diesel.submit", payload: input },
    async (tx) => {
      const result = await submitDieselOnly(operatorId, input, { tx });
      if ("error" in result) return { ok: false, failure: result };
      return {
        ok: true,
        status: 200,
        body: result,
        resourceType: "DailyWorkLog",
        resourceId: result.logId,
      };
    },
  );
});
