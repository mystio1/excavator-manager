import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBusinessApi } from "@/lib/api-auth";
import { deletePayment, updatePayment } from "@/lib/services/bills";

const schema = z.object({
  amount: z.coerce.number().min(1, "Enter an amount greater than 0"),
  date: z.string().min(1),
  method: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id, paymentId } = await params;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }
  const result = await updatePayment(auth.session.businessId, { billId: id, paymentId, ...parsed.data });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id, paymentId } = await params;

  const result = await deletePayment(auth.session.businessId, id, paymentId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
