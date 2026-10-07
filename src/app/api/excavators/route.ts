import { requireBusinessApi } from "@/lib/api-auth";
import { json, parseBody, withApi } from "@/lib/with-api";
import { createExcavator, getMachinePerformanceSummary, listExcavators } from "@/lib/services/excavators";
import { addExcavatorSchema } from "@/lib/validation/excavator";

export const GET = withApi("excavators.list", async () => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const [excavators, machinePerformance] = await Promise.all([
    listExcavators(businessId),
    getMachinePerformanceSummary(businessId),
  ]);

  return json({ excavators, machinePerformance });
});

export const POST = withApi("excavators.create", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const input = await parseBody(req, addExcavatorSchema);
  const excavator = await createExcavator(auth.session.businessId, auth.actor, input);
  return json({ excavator });
});
