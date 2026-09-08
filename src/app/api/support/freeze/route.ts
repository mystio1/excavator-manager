import { NextResponse } from "next/server";
import { requireSupportApi } from "@/lib/supportTokens";
import { setBusinessFrozen } from "@/lib/services/support";

export async function POST(req: Request) {
  const auth = requireSupportApi(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const businessCode = typeof body?.businessCode === "string" ? body.businessCode : "";
  const frozen = Boolean(body?.frozen);

  const result = await setBusinessFrozen(businessCode, frozen);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });

  return NextResponse.json({ business: result.business });
}
