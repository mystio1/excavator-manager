import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { createServiceRecord } from "@/lib/services/serviceRecords";
import { createServiceRecordSchema } from "@/lib/validation/serviceRecord";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const parsed = createServiceRecordSchema.safeParse({ ...(await req.json()), excavatorId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await createServiceRecord(auth.session.businessId, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}
