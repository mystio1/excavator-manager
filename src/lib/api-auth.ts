import { NextResponse } from "next/server";
import { getValidBusinessSession, getValidOperatorSession } from "@/lib/session";

/**
 * API-route analogue of requireBusiness()/requireOperator() — those call
 * redirect(), which throws a signal meant for React rendering and has no
 * meaning inside a Route Handler, which must return a real Response. These
 * return a 401 JSON response instead, for the client-fetched pages/mutations
 * added for the Android app's bundled build.
 */
export async function requireBusinessApi() {
  const session = await getValidBusinessSession();
  if (!session) {
    return { session: null, error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  }
  return { session, error: null } as const;
}

export async function requireOperatorApi() {
  const session = await getValidOperatorSession();
  if (!session) {
    return { session: null, error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  }
  return { session, error: null } as const;
}
