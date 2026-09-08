import { requireBusinessApi } from "@/lib/api-auth";
import { listBills } from "@/lib/services/bills";
import { getBusinessSettings } from "@/lib/services/settings";
import { buildBillsRegisterWorkbook } from "@/lib/services/billExcel";

export async function GET(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId") ?? undefined;
  const filter = searchParams.get("filter");
  const isDirect = filter === "app" ? false : filter === "self" ? true : undefined;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  const [bills, business] = await Promise.all([
    listBills(businessId, { customerId, isDirect, from, to }),
    getBusinessSettings(businessId),
  ]);

  const workbook = buildBillsRegisterWorkbook(bills, { businessName: business.name, from, to });
  const buffer = await workbook.xlsx.writeBuffer();

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bills-register-${stamp}.xlsx"`,
    },
  });
}
