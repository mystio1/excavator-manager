import { requireOperatorApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { submitDailyLog } from "@/lib/services/workSessions";
import { dailyLogSchema } from "@/lib/validation/workSession";
import { json, parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("operator.dailyLog.submit", async (req) => {
  const auth = await requireOperatorApi();
  if (auth.error) return auth.error;

  const input = await parseBody(req, dailyLogSchema);
  const result = await submitDailyLog(auth.session.operatorId, input);
  if ("error" in result) return failureResponse(result);

  return json(result);
});
