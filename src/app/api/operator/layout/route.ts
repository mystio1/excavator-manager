import { NextResponse } from "next/server";
import { requireOperatorApi } from "@/lib/api-auth";
import { db } from "@/lib/db";

/** Backs the client-rendered (operator)/layout.tsx used by the Android
 * bundled build — same data the server-rendered operator layout fetches
 * directly. */
export async function GET() {
  const auth = await requireOperatorApi();
  if (auth.error) return auth.error;

  const operator = await db.operator.findUniqueOrThrow({
    where: { id: auth.session.operatorId },
    select: { name: true },
  });

  return NextResponse.json({ operatorName: operator.name });
}
