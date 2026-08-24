import { NextResponse } from "next/server";
import { requireOperatorApi } from "@/lib/api-auth";
import { endOperatorWork } from "@/lib/services/operatorWorkRequests";
import { endOperatorWorkSchema } from "@/lib/validation/operatorWorkRequest";

export async function POST(req: Request) {
  const auth = await requireOperatorApi();
  if (auth.error) return auth.error;

  const parsed = endOperatorWorkSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const result = await endOperatorWork(auth.session.operatorId, parsed.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}
