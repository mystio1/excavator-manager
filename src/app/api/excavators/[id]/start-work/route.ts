import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { json, parseBody, withApi } from "@/lib/with-api";
import { startWork } from "@/lib/services/workSessions";
import { startWorkSchema } from "@/lib/validation/workSession";

// The machine comes from the URL, never from the body.
const bodySchema = startWorkSchema.omit({ excavatorId: true });

export const POST = withApi("excavators.startWork", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await parseBody(req, bodySchema);
  const result = await startWork(auth.session.businessId, auth.actor, { ...body, excavatorId: id });
  if ("error" in result) return failureResponse(result);

  return json(result);
});
