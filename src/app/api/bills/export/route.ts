import { requireBusinessApi } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { exportRules } from "@/lib/auth-throttle";
import { db } from "@/lib/db";
import { listBillsForExport } from "@/lib/services/bills";
import { getBusinessSettings } from "@/lib/services/settings";
import { buildBillsRegisterWorkbook } from "@/lib/services/billExcel";
import { enforceRateLimits } from "@/lib/rateLimit";
import { billsExportQuerySchema } from "@/lib/validation/bill";
import { withApi } from "@/lib/with-api";

/** Bulk register export. Bounded and accountable: validated query, per-business rate limit, a hard row cap that
 * is announced IN the file (and in `X-Export-Truncated`), and one audit entry per export (who, filters, rows). */
export const GET = withApi("bills.export-register", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  await enforceRateLimits(exportRules(businessId), "Too many exports. Please wait a few minutes and try again.");

  const { searchParams } = new URL(req.url);
  const query = billsExportQuerySchema.parse(Object.fromEntries(searchParams));
  const isDirect = query.filter === "app" ? false : query.filter === "self" ? true : undefined;
  const { customerId, from, to, q } = query;

  const [{ bills, truncated, cap }, business] = await Promise.all([
    listBillsForExport(businessId, { customerId, isDirect, from, to, q }),
    getBusinessSettings(businessId),
  ]);

  const workbook = buildBillsRegisterWorkbook(bills, { businessName: business.name, from, to, truncatedAt: truncated ? cap : undefined });
  const buffer = await workbook.xlsx.writeBuffer();

  await recordAudit(db, {
    businessId,
    actor: auth.actor,
    action: "bills.export",
    entityType: "Bill",
    entityId: "register",
    details: { filters: { customerId, filter: query.filter, from, to, q }, rowCount: bills.length, truncated },
  });

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bills-register-${stamp}.xlsx"`,
      "Cache-Control": "private, no-store, max-age=0",
      ...(truncated ? { "X-Export-Truncated": "true" } : {}),
    },
  });
});
