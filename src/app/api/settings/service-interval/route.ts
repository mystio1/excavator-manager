import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { db } from "@/lib/db";

/** Just the one field the Edit Machine form needs as a placeholder — not
 * the full settings page, which has its own richer endpoint. */
export async function GET() {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const business = await db.business.findUniqueOrThrow({
    where: { id: auth.session.businessId },
    select: { defaultServiceIntervalHrs: true },
  });
  return NextResponse.json(business);
}
