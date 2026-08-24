import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { listCustomerOptions } from "@/lib/services/customers";

export async function GET() {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const customers = await listCustomerOptions(auth.session.businessId);
  return NextResponse.json({ customers });
}
