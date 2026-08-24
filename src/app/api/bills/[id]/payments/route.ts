import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { addPayment } from "@/lib/services/bills";
import { addPaymentSchema } from "@/lib/validation/bill";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const parsed = addPaymentSchema.safeParse({ ...(await req.json()), billId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await addPayment(auth.session.businessId, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}
