import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { countBillsByType, listBills } from "@/lib/services/bills";

export async function GET(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId") ?? undefined;
  const filter = searchParams.get("filter");
  const isDirect = filter === "app" ? false : filter === "self" ? true : undefined;

  const [bills, counts] = await Promise.all([
    listBills(businessId, { customerId, isDirect }),
    countBillsByType(businessId, customerId),
  ]);

  return NextResponse.json({ bills, counts });
}
