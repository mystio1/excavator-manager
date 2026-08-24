import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * The Android app's bundled static build (webDir mode, no live server.url)
 * runs from https://localhost — Capacitor's default Android origin — while
 * the API lives on the real Render domain. Every /api/* call from the app
 * is cross-origin, so it needs explicit CORS headers (and needs to survive
 * the browser's preflight OPTIONS request) or the browser/WebView drops it
 * before it ever reaches a route handler.
 */
const ALLOWED_ORIGIN = "https://localhost";

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const isAllowedOrigin = origin === ALLOWED_ORIGIN;

  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (isAllowedOrigin) {
      response.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    }
    return response;
  }

  const response = NextResponse.next();
  if (isAllowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
