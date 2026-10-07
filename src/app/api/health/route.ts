import { NextResponse } from "next/server";

/**
 * Liveness check for Render's Health Check Path and external uptime
 * monitors. Lives under /api/ (rather than a bare /health) specifically so
 * it's automatically covered by scripts/build-android.mjs, which strips
 * all of src/app/api/* before the Android static-export build (Route
 * Handlers aren't supported by `output: "export"`) — a route placed
 * outside that directory would break `npm run build:android`.
 *
 * src/proxy.ts runs in front of this (matcher "/api/:path*"): it only
 * rejects cross-site state-changing requests (CSRF) and adds CORS/request-id
 * headers. This is a GET, so it stays reachable with no auth for Render, an
 * external uptime monitor, or anyone else.
 *
 * LIVENESS vs READINESS: this endpoint answers "is the process alive" and is
 * what Render's Health Check Path should point at (a failing health check
 * restarts the service, which a database blip must not trigger). Use
 * GET /api/health/ready for "can this instance actually serve traffic"
 * (database + required configuration) from an uptime monitor / alert.
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
