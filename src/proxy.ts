import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CAPACITOR_ANDROID_ORIGIN } from "@/lib/config";
import { checkCsrf } from "@/lib/csrf";
import { problemBody } from "@/lib/problem";

/**
 * Edge of the API: runs for every /api/* request.
 *
 * 1. CSRF — every state-changing request (POST/PUT/PATCH/DELETE) must come
 *    from a trusted origin (see src/lib/csrf.ts for why CORS alone is not
 *    enough). Rejected with 403 CSRF_VALIDATION_FAILED.
 * 2. CORS — the Android app's bundled static build runs from
 *    https://localhost (Capacitor's default Android origin) while the API
 *    lives on the real server domain, so every /api/* call from the app is
 *    cross-origin and needs explicit CORS headers (and a successful preflight)
 *    or the WebView drops it before it reaches a route handler.
 * 3. Request id — every request gets an x-request-id (reused from the client
 *    if it sent a well-formed one) that appears in logs and error bodies.
 */

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const ALLOWED_HEADERS = "Content-Type, Idempotency-Key, X-Request-Id, Authorization";
const EXPOSED_HEADERS = "X-Request-Id, Retry-After, Idempotent-Replay";

function withCors(response: NextResponse, origin: string | null) {
  if (origin === CAPACITOR_ANDROID_ORIGIN) {
    response.headers.set("Access-Control-Allow-Origin", CAPACITOR_ANDROID_ORIGIN);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Expose-Headers", EXPOSED_HEADERS);
    response.headers.append("Vary", "Origin");
  }
  return response;
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (origin === CAPACITOR_ANDROID_ORIGIN) {
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
      response.headers.set("Access-Control-Max-Age", "600");
    }
    return withCors(response, origin);
  }

  const inbound = request.headers.get("x-request-id");
  const requestId = inbound && REQUEST_ID_RE.test(inbound) ? inbound : crypto.randomUUID();

  const csrf = checkCsrf(request);
  if (!csrf.ok) {
    const response = NextResponse.json(
      problemBody({
        code: "CSRF_VALIDATION_FAILED",
        title: "Cross-site request rejected",
        message: "This request was blocked because it did not come from the application.",
        status: 403,
        requestId,
      }),
      { status: 403 },
    );
    response.headers.set("x-request-id", requestId);
    return withCors(response, origin);
  }

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return withCors(response, origin);
}

export const config = {
  matcher: "/api/:path*",
};
