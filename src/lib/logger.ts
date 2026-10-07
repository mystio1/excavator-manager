import { getContext } from "@/lib/request-context";

/**
 * Structured (one JSON object per line) logger. Output goes to stdout/stderr,
 * which Render captures and which any log drain (Datadog, Better Stack,
 * Grafana Loki...) can ingest without code changes.
 *
 * Safe by construction: any field whose key looks sensitive is redacted, and
 * request-scoped context (requestId, businessId, userId, route) is attached
 * automatically.
 */

type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY = /pass(word)?|pin|token|secret|authorization|cookie|api[-_]?key|hash|otp|verification/i;
const MAX_DEPTH = 5;

function minLevel(): number {
  const configured = (process.env.LOG_LEVEL ?? "info").toLowerCase() as Level;
  return LEVELS[configured] ?? LEVELS.info;
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

export function serializeError(err: unknown) {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return {
      name: err.name,
      message: err.message,
      ...(typeof code === "string" ? { code } : {}),
      stack: process.env.NODE_ENV === "production" ? err.stack?.split("\n").slice(0, 6).join("\n") : err.stack,
    };
  }
  return { message: String(err) };
}

function write(level: Level, message: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < minLevel()) return;
  const ctx = getContext();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    requestId: ctx?.requestId,
    businessId: ctx?.businessId,
    userId: ctx?.userId,
    route: ctx?.route,
    operation: ctx?.operation,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  });
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, err?: unknown, fields?: Record<string, unknown>) =>
    write("error", msg, { ...(err !== undefined ? { error: serializeError(err) } : {}), ...fields }),
};
