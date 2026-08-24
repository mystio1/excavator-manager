import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { getBillDetail, toBillPreviewData } from "@/lib/services/bills";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const bill = await getBillDetail(auth.session.businessId, id);
  if (!bill) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ bill, previewData: toBillPreviewData(bill) });
}
