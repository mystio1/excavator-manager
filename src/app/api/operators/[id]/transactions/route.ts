import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { createTransaction } from "@/lib/services/operatorTransactions";
import { addTransactionSchema } from "@/lib/validation/operatorTransaction";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const parsed = addTransactionSchema.safeParse({ ...(await req.json()), operatorId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  await createTransaction(auth.session.businessId, parsed.data);
  return NextResponse.json({ ok: true });
}
