import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { getAlerts } from "@/lib/services/dashboard";

/** Backs the client-rendered (app)/layout.tsx used by the Android bundled
 * build — same data the server-rendered web layout fetches directly. */
export async function GET() {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessName, ownerName, businessId } = auth.session;

  const alerts = await getAlerts(businessId);

  return NextResponse.json({ businessName, ownerName, alerts });
}
