import { NextResponse } from "next/server";
import { requireOperatorApi } from "@/lib/api-auth";
import { submitDailyLog } from "@/lib/services/workSessions";
import { dailyLogSchema } from "@/lib/validation/workSession";

export async function POST(req: Request) {
  const auth = await requireOperatorApi();
  if (auth.error) return auth.error;

  const parsed = dailyLogSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await submitDailyLog(auth.session.operatorId, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}
