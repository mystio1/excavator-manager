import { Capacitor } from "@capacitor/core";

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
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

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
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text, reviveDates) : undefined;
  if (!res.ok) {
    throw new ApiError((body as { error?: string } | undefined)?.error ?? `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

/** Shared fetcher for useSWR(url, swrFetcher) call sites. */
export const swrFetcher = <T>(path: string) => apiFetch<T>(path);
