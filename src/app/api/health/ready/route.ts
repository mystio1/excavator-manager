import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isProduction } from "@/lib/config";
import { checkConfig as validateConfig } from "@/lib/config-check";

/**
 * READINESS check: can this instance serve real traffic right now?
 *
 *   - database: a trivial `SELECT 1` through the same pool the app uses,
 *     bounded to 3 s so a hung database cannot hang the probe
 *   - config: required environment variables are present and well-formed
 *     (src/lib/config-check.ts; problems are logged, never values)
 *
 * 200 when everything is ready, 503 otherwise. Point an uptime monitor / alert
 * at this; keep Render's Health Check Path on the DB-free /api/health so a
 * database outage alerts you without restarting the service in a loop.
 * Unauthenticated by design, so it reveals nothing beyond ok/failed per check.
 */
export const dynamic = "force-dynamic";

async function checkDatabase(): Promise<"ok" | "failed"> {
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("database check timed out")), 3000)),
    ]);
    return "ok";
  } catch (error) {
    logger.error("readiness: database check failed", error);
    return "failed";
  }
}

function checkConfig(): "ok" | "failed" {
  const { errors } = validateConfig(process.env, isProduction);
  if (errors.length > 0) {
    logger.error("readiness: configuration invalid", undefined, { problems: errors });
    return "failed";
  }
  return "ok";
}

export async function GET() {
  const [database, config] = [await checkDatabase(), checkConfig()];
  const ready = database === "ok" && config === "ok";
  return NextResponse.json(
    { status: ready ? "ready" : "unavailable", checks: { database, config } },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
