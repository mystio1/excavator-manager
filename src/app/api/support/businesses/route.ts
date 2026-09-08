import { NextResponse } from "next/server";
import { requireSupportApi } from "@/lib/supportTokens";
import { listBusinessesForSupport } from "@/lib/services/support";

export async function GET(req: Request) {
  const auth = requireSupportApi(req);
  if (auth.error) return auth.error;

  const businesses = await listBusinessesForSupport();
  return NextResponse.json({ businesses });
}
