import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { json, withApi } from "@/lib/with-api";
import { approveDailyLog } from "@/lib/services/workSessions";
import { expectedVersionFromQuery } from "@/lib/validation/workSession";

export const POST = withApi("dailyLogs.approve", async (req, { params }: { params: Promise<{ logId: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { logId } = await params;

  const result = await approveDailyLog(auth.session.businessId, auth.actor, logId, {
    expectedVersion: expectedVersionFromQuery(req),
  });
  if ("error" in result) return failureResponse(result);
  return json({ ok: true });
});
