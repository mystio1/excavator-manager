import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { json, parseBody, withApi } from "@/lib/with-api";
import { deleteDailyLog, updateDailyLog } from "@/lib/services/workSessions";
import { expectedVersionFromQuery, updateDailyLogSchema } from "@/lib/validation/workSession";

export const PATCH = withApi("dailyLogs.update", async (req, { params }: { params: Promise<{ logId: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { logId } = await params;

  const input = await parseBody(req, updateDailyLogSchema);
  const result = await updateDailyLog(auth.session.businessId, auth.actor, logId, input);
  if ("error" in result) return failureResponse(result);
  return json(result);
});

export const DELETE = withApi("dailyLogs.delete", async (req, { params }: { params: Promise<{ logId: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { logId } = await params;

  const result = await deleteDailyLog(auth.session.businessId, auth.actor, logId, {
    expectedVersion: expectedVersionFromQuery(req),
  });
  if ("error" in result) return failureResponse(result);
  return json({ ok: true });
});
