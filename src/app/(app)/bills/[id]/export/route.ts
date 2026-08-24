import { requireBusiness } from "@/lib/session";
import { getBillDetail, toBillPreviewData } from "@/lib/services/bills";
import { buildBillWorkbook } from "@/lib/services/billExcel";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { businessId } = await requireBusiness();

  const bill = await getBillDetail(businessId, id);
  if (!bill) return new Response("Bill not found", { status: 404 });

  const workbook = buildBillWorkbook(toBillPreviewData(bill));
  const buffer = await workbook.xlsx.writeBuffer();

  const safeName = bill.billNumber.replace(/[^a-zA-Z0-9-]/g, "-");

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bill-${safeName}.xlsx"`,
    },
  });
}
