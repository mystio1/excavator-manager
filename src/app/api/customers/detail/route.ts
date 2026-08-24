import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { getCustomerDetail } from "@/lib/services/customers";

export async function GET(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const detail = await getCustomerDetail(auth.session.businessId, id, {
    excavatorId: searchParams.get("excavatorId") ?? undefined,
    siteName: searchParams.get("site") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ detail });
}
