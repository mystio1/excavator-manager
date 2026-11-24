import { requireBusinessApi } from "@/lib/api-auth";
import { errorResponse, failureResponse } from "@/lib/api-error";
import { deleteBill, getBillDetail, toBillPreviewData, updateBill } from "@/lib/services/bills";
import { getBillSummaryRows } from "@/lib/services/billSummary";
import { db } from "@/lib/db";
import type { BillTemplate } from "@/components/bill/summary-rows";
import { parseExpectedVersion, updateBillSchema } from "@/lib/validation/bill";
import { json, parseBody, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi("bills.get", async (_req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const bill = await getBillDetail(auth.session.businessId, id);
  if (!bill) return errorResponse("NOT_FOUND", "Bill not found");

  // The layout chosen in the Bills tab; the day rows are only built when it is the daily sheet.
  const { billTemplate } = await db.business.findUniqueOrThrow({
    where: { id: auth.session.businessId },
    select: { billTemplate: true },
  });
  const template = (billTemplate === "DAILY_SUMMARY" ? "DAILY_SUMMARY" : "STANDARD") as BillTemplate;
  const summaryRows = template === "DAILY_SUMMARY" ? await getBillSummaryRows(auth.session.businessId, bill) : null;
  return json({ bill, previewData: { ...toBillPreviewData(bill), template, summaryRows } });
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
