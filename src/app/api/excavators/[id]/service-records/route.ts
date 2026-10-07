import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";
import { json, parseBody, withApi } from "@/lib/with-api";
import { createServiceRecord } from "@/lib/services/serviceRecords";
import { createServiceRecordSchema } from "@/lib/validation/serviceRecord";

// The machine comes from the URL, never from the body.
const bodySchema = createServiceRecordSchema.omit({ excavatorId: true });

export const POST = withApi(
  "excavators.createServiceRecord",
  async (req, { params }: { params: Promise<{ id: string }> }) => {
    const auth = await requireBusinessApi();
    if (auth.error) return auth.error;
    const { id } = await params;

    const body = await parseBody(req, bodySchema);
    const result = await createServiceRecord(auth.session.businessId, auth.actor, { ...body, excavatorId: id });
    if ("error" in result) return failureResponse(result);

    return json(result);
  },
);
