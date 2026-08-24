import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { createDirectBill } from "@/lib/services/bills";
import { generateDirectBillSchema } from "@/lib/validation/directBill";

export async function POST(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = generateDirectBillSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await createDirectBill(auth.session.businessId, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}
