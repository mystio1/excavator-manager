import { NextResponse } from "next/server";

/**
 * Liveness check for Render's Health Check Path and external uptime
 * monitors. Lives under /api/ (rather than a bare /health) specifically so
 * it's automatically covered by scripts/build-android.mjs, which strips
 * all of src/app/api/* before the Android static-export build (Route
 * Handlers aren't supported by `output: "export"`) — a route placed
 * outside that directory would break `npm run build:android`.
 *
 * src/proxy.ts's middleware does run in front of this (its matcher is
 * "/api/:path*"), but it only ever adds CORS headers when the request's
 * Origin is the Capacitor Android app's origin — it never adds auth or
 * blocks requests, so this stays reachable with no auth for Render, an
 * external uptime monitor, or anyone else.
 *
 * Deliberately does not touch the database: this app's Postgres
 * connection pool is capped low (see src/lib/db.ts's comment on Supabase's
 * session pooler limit), so a health check hit every few seconds/minutes
 * should never compete with real requests for a pool connection just to
 * answer "is the process up". If this process can run any JS at all, it
 * returns 200.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
