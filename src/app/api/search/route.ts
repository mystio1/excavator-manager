import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { globalSearch } from "@/lib/services/search";

export async function GET(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";

  const results = await globalSearch(auth.session.businessId, q);
  return NextResponse.json({ results });
}
