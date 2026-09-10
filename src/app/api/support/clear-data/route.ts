import { NextResponse } from "next/server";
import { requireSupportApi } from "@/lib/supportTokens";
import { clearBusinessData } from "@/lib/services/support";

export async function POST(req: Request) {
  const auth = requireSupportApi(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const businessCode = typeof body?.businessCode === "string" ? body.businessCode : "";
  // The confirmation the client collected from whoever's driving the
  // console — checked again here, not just in the UI, since this deletes
  // real business data with no undo.
  const confirmCode = typeof body?.confirmCode === "string" ? body.confirmCode : "";

  if (confirmCode.trim().toUpperCase() !== businessCode.trim().toUpperCase()) {
    return NextResponse.json({ error: "Confirmation code doesn't match the business code" }, { status: 400 });
  }

  const result = await clearBusinessData(businessCode);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });

  return NextResponse.json({ business: result.business, counts: result.counts });
}
