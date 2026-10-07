import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { json, parseBody, withApi } from "@/lib/with-api";
import { addDailyLog } from "@/lib/services/workSessions";
import { dailyLogSchema } from "@/lib/validation/workSession";

export const POST = withApi("excavators.addDailyLog", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const input = await parseBody(req, dailyLogSchema);
  // `excavatorId` pins the work session to the machine named in the URL.
  const result = await addDailyLog(auth.session.businessId, auth.actor, input, { excavatorId: id });
  if ("error" in result) return failureResponse(result);

  return json(result);
});
