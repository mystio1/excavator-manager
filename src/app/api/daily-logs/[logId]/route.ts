import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { deleteDailyLog, updateDailyLog } from "@/lib/services/workSessions";
import { dailyLogSchema } from "@/lib/validation/workSession";

export async function PATCH(req: Request, { params }: { params: Promise<{ logId: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { logId } = await params;

  const parsed = dailyLogSchema.safeParse({ ...(await req.json()), workSessionId: "-" });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await updateDailyLog(auth.session.businessId, logId, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ logId: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { logId } = await params;

  await deleteDailyLog(auth.session.businessId, logId);
  return NextResponse.json({ ok: true });
}
