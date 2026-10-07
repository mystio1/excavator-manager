import type { Instrumentation } from "next";

/**
 * Runs once when the server process starts, and receives every error Next.js
 * catches while rendering or serving (including Server Components and Route
 * Handlers that escaped withApi()). Errors go to the structured logger — one
 * JSON line each — which Render captures; swap in an error-tracking SDK here
 * (Sentry, etc.) without touching call sites.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { isProduction } = await import("@/lib/config");
  const { checkConfig } = await import("@/lib/config-check");
  const { logger } = await import("@/lib/logger");
  const { errors, warnings } = checkConfig(process.env, isProduction);
  // Problems only, never values. /api/health/ready reports the same errors, so an
  // uptime monitor pointed at it alerts on a bad deploy instead of users finding it.
  if (errors.length > 0) logger.error("startup: configuration is invalid", undefined, { problems: errors });
  if (warnings.length > 0) logger.warn("startup: configuration warnings", { problems: warnings });
  if (errors.length === 0 && warnings.length === 0) logger.info("startup: configuration looks complete");
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { logger } = await import("@/lib/logger");
  logger.error("unhandled request error", error, {
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    digest:
      typeof error === "object" && error !== null && "digest" in error
        ? String((error as { digest: unknown }).digest)
        : undefined,
  });
};
