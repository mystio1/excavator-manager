import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { deleteDailyLog } from "@/lib/services/workSessions";

export async function DELETE(_req: Request, { params }: { params: Promise<{ logId: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { logId } = await params;

  await deleteDailyLog(auth.session.businessId, logId);
  return NextResponse.json({ ok: true });
}
