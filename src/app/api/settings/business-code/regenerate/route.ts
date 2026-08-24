import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { regenerateBusinessCode } from "@/lib/services/settings";

export async function POST(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const { customCode } = (await req.json()) as { customCode?: string };
  if (customCode && !/^[A-Za-z0-9]{3,20}$/.test(customCode.trim())) {
    return NextResponse.json({ error: "Business code must be 3-20 letters/numbers, no spaces or symbols" }, { status: 400 });
  }

  const result = await regenerateBusinessCode(auth.session.businessId, customCode);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}
