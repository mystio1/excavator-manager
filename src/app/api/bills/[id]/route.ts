import { requireBusinessApi } from "@/lib/api-auth";
import { errorResponse, failureResponse } from "@/lib/api-error";
import { deleteBill, getBillDetail, toBillPreviewData, updateBill } from "@/lib/services/bills";
import { parseExpectedVersion, updateBillSchema } from "@/lib/validation/bill";
import { json, parseBody, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi("bills.get", async (_req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const bill = await getBillDetail(auth.session.businessId, id);
  if (!bill) return errorResponse("NOT_FOUND", "Bill not found");

  return json({ bill, previewData: toBillPreviewData(bill) });
});

export const PATCH = withApi("bills.update", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const input = await parseBody(req, updateBillSchema);

  const result = await updateBill(auth.session.businessId, auth.actor, id, input);
  if ("error" in result) return failureResponse(result);

  return json(result);
});

export const DELETE = withApi("bills.delete", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const result = await deleteBill(auth.session.businessId, auth.actor, id, {
    expectedVersion: parseExpectedVersion(req),
  });
  if ("error" in result) return failureResponse(result);
  return json(result);
});
