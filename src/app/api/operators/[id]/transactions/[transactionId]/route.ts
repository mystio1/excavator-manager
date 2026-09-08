import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { deleteTransaction, updateTransaction } from "@/lib/services/operatorTransactions";
import { updateTransactionSchema } from "@/lib/validation/operatorTransaction";

export async function PATCH(req: Request, { params }: { params: Promise<{ transactionId: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { transactionId } = await params;

  const parsed = updateTransactionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  await updateTransaction(auth.session.businessId, transactionId, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ transactionId: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { transactionId } = await params;

  await deleteTransaction(auth.session.businessId, transactionId);
  return NextResponse.json({ ok: true });
}
