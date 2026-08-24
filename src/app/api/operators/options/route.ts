import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { listOperatorOptions } from "@/lib/services/operators";

export async function GET() {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const operators = await listOperatorOptions(auth.session.businessId);
  return NextResponse.json({ operators });
}
