import { requireBusinessApi } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-error";
import { db } from "@/lib/db";
import { json, withApi } from "@/lib/with-api";
import { getComponentHistory } from "@/lib/services/serviceRecords";

export const GET = withApi(
  "excavators.componentHistory",
  async (_req, { params }: { params: Promise<{ id: string; componentId: string }> }) => {
    const auth = await requireBusinessApi();
    if (auth.error) return auth.error;
    const { id, componentId } = await params;

    const component = await db.serviceItem.findFirst({
      where: { id: componentId, businessId: auth.session.businessId },
    });
    if (!component) return errorResponse("NOT_FOUND", "Component not found");

    const history = await getComponentHistory(auth.session.businessId, id, componentId);
    return json({ component, history });
  },
);
