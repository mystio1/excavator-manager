import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { listCustomers } from "@/lib/services/customers";

export async function GET(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  const tripDate = searchParams.get("tripDate") ?? undefined;

  const customers = await listCustomers(businessId, q, tripDate);
  return NextResponse.json({ customers });
}
