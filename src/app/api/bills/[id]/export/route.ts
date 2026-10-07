import { requireBusinessApi } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-error";
import { recordAudit } from "@/lib/audit";
import { exportRules } from "@/lib/auth-throttle";
import { db } from "@/lib/db";
import { enforceRateLimits } from "@/lib/rateLimit";
import { getBillDetail, toBillPreviewData } from "@/lib/services/bills";
import { buildBillWorkbook } from "@/lib/services/billExcel";
import { withApi } from "@/lib/with-api";

export const GET = withApi("bills.export", async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  await enforceRateLimits(exportRules(auth.session.businessId), "Too many exports. Please wait a few minutes and try again.");

  const bill = await getBillDetail(auth.session.businessId, id);
  if (!bill) return errorResponse("NOT_FOUND", "Bill not found");

  const workbook = buildBillWorkbook(toBillPreviewData(bill));
  const buffer = await workbook.xlsx.writeBuffer();

  await recordAudit(db, {
    businessId: auth.session.businessId,
    actor: auth.actor,
    action: "bill.export",
    entityType: "Bill",
    entityId: bill.id,
    details: { billNumber: bill.billNumber },
  });

  const safeName = bill.billNumber.replace(/[^a-zA-Z0-9-]/g, "-");

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bill-${safeName}.xlsx"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
});
