import { NextResponse } from "next/server";
import { requireSupportApi } from "@/lib/supportTokens";
import { setBusinessLimits } from "@/lib/services/support";

export async function POST(req: Request) {
  const auth = requireSupportApi(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const businessCode = typeof body?.businessCode === "string" ? body.businessCode : "";

  const result = await setBusinessLimits(businessCode, { maxOperators: body?.maxOperators, maxBillsPerDay: body?.maxBillsPerDay });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ business: result.business });
}
