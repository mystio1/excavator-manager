import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { approveDailyLog } from "@/lib/services/workSessions";

export async function POST(_req: Request, { params }: { params: Promise<{ logId: string }> }) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { logId } = await params;

  await approveDailyLog(auth.session.businessId, logId);
  return NextResponse.json({ ok: true });
}
