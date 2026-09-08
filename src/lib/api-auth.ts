import { NextResponse } from "next/server";
import { getValidBusinessSession, getValidOperatorSession } from "@/lib/session";

const FROZEN_RESPONSE = () =>
  NextResponse.json(
    { error: "This account has been frozen by our support team. Your data is safe — contact support for recovery.", frozen: true },
    { status: 423 },
  );

/**
 * API-route analogue of requireBusiness()/requireOperator() — those call
 * redirect(), which throws a signal meant for React rendering and has no
 * meaning inside a Route Handler, which must return a real Response. These
 * return a 401 JSON response instead, for the client-fetched pages/mutations
 * added for the Android app's bundled build.
 *
 * `allowFrozen` exists only for /api/layout — every business's client polls
 * it to render the shell, and it's how a frozen business's own client
 * learns it's frozen at all (see (app)/layout.tsx). Every other route
 * blocks outright (423) once support has frozen a business — this is
 * enforced here, not just as a frontend overlay, so it can't be bypassed by
 * a stale client.
 */
export async function requireBusinessApi(options?: { allowFrozen?: boolean }) {
  const session = await getValidBusinessSession();
  if (!session) {
    return { session: null, error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  }
  if (session.businessFrozen && !options?.allowFrozen) {
    return { session: null, error: FROZEN_RESPONSE() } as const;
  }
  return { session, error: null } as const;
}

export async function requireOperatorApi(options?: { allowFrozen?: boolean }) {
  const session = await getValidOperatorSession();
  if (!session) {
    return { session: null, error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  }
  if (session.businessFrozen && !options?.allowFrozen) {
    return { session: null, error: FROZEN_RESPONSE() } as const;
  }
  return { session, error: null } as const;
}
