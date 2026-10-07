import { Capacitor } from "@capacitor/core";
import { config as zodConfig } from "zod/v4/core";

// Browser only: Zod 4 probes at runtime whether it may compile validators with
// `Function("")` (JIT). The production Content-Security-Policy deliberately
// forbids eval, so the probe would be reported as a CSP violation on every page
// load (it fails safe, but the console noise would hide real violations). Plain
// interpretation of the schemas is fast enough for form validation in the
// browser; the server keeps the JIT.
if (typeof window !== "undefined") zodConfig({ jitless: true });

// The Android bundled build has no server of its own to resolve a relative
// "/api/..." path against — it runs from a local file origin and has to
// call the real deployed API explicitly.
const API_BASE = "https://excavator-manager.onrender.com";

/** Exported for the rare non-fetch case (e.g. an <a href download> link)
 * that needs the same origin-resolution logic apiFetch applies internally. */
export function apiUrl(path: string): string {
  return Capacitor.isNativePlatform() ? `${API_BASE}${path}` : path;
}

export class ApiError extends Error {
  status: number;
  /** Machine-readable error code from the server (e.g. "RESOURCE_MODIFIED"), when present. */
  code?: string;
  requestId?: string;
  details?: unknown;
  constructor(message: string, status: number, extra?: { code?: string; requestId?: string; details?: unknown }) {
    super(message);
    this.status = status;
    this.code = extra?.code;
    this.requestId = extra?.requestId;
    this.details = extra?.details;
  }
}

/** A fresh Idempotency-Key for ONE logical submission. Generate it when the
 * form opens / after each successful submit, and send the SAME key on retries
 * of that submission (see apiFetch's `idempotencyKey` option). */
export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export type ApiFetchInit = RequestInit & { idempotencyKey?: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Server Components get real Date objects straight from Prisma; a fetched
 * JSON response only has strings. Every service function already returns
 * Date fields as-is (never pre-formatted), so reviving anything that looks
 * like the JSON.stringify(Date) shape back into a real Date here means
 * every existing component (formatDate, date-fns calls, etc.) keeps working
 * unchanged whether its data came from a Server Component or this client. */
function reviveDates(_key: string, value: unknown): unknown {
  return typeof value === "string" && ISO_DATE_RE.test(value) ? new Date(value) : value;
}

/** credentials: "include" is required on the native build — the session
 * cookie is cross-origin there (see src/lib/auth.ts's sameSite: "none")
 * and fetch() never sends cross-origin cookies without it. Harmless no-op
 * on the same-origin web build. */
export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const { idempotencyKey, ...rest } = init ?? {};
  const res = await fetch(apiUrl(path), {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...(rest.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text, reviveDates) : undefined;
  } catch {
    // A non-JSON body (an HTML error page from a proxy or host, a plain-text
    // error some route forgot to NextResponse.json(), etc.) shouldn't
    // surface as a raw, confusing SyntaxError — fall back to the response
    // text itself (or a generic message) as the error.
    throw new ApiError(!res.ok && text ? text.slice(0, 200) : `Request failed (${res.status})`, res.status);
  }
  if (!res.ok) {
    const err = body as { error?: string; code?: string; requestId?: string; details?: unknown } | undefined;
    throw new ApiError(err?.error ?? `Request failed (${res.status})`, res.status, {
      code: err?.code,
      requestId: err?.requestId,
      details: err?.details,
    });
  }
  return body as T;
}

/** Shared fetcher for useSWR(url, swrFetcher) call sites. */
export const swrFetcher = <T>(path: string) => apiFetch<T>(path);
