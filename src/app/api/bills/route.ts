import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { countBillsByType, createBill, listBills } from "@/lib/services/bills";
import { generateBillSchema } from "@/lib/validation/bill";

export async function POST(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = generateBillSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await createBill(auth.session.businessId, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}

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
