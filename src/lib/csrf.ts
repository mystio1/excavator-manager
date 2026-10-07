import { trustedOrigins } from "@/lib/config";

/**
 * CSRF protection for state-changing API requests.
 *
 * Why this exists: the production session cookie is `SameSite=None; Secure`
 * (the Android app's bundled UI calls the API cross-origin, which requires
 * it), so browsers attach it to requests started by ANY website. Route
 * handlers parse the body with req.json() regardless of Content-Type, so a
 * plain cross-site <form enctype="text/plain"> POST would otherwise be
 * accepted. CORS does not help — it only governs who can READ responses.
 *
 * Rules for POST / PUT / PATCH / DELETE:
 *   1. Origin present  → must be a trusted origin (APP_URL, ALLOWED_ORIGINS,
 *      the Capacitor Android origin) or have the same host as this request.
 *   2. Origin absent   → Sec-Fetch-Site must be same-origin or none.
 *   3. Neither header  → not a browser-originated cross-site request; allowed
 *      only if the request carries no session cookie (nothing to forge).
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/;

export type CsrfResult = { ok: true } | { ok: false; reason: string };

export function checkCsrf(request: Request): CsrfResult {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return { ok: true };

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (origin) {
    if (origin === "null") return { ok: false, reason: "opaque origin" };
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      return { ok: false, reason: "malformed origin" };
    }
    if (trustedOrigins().has(parsed.origin)) return { ok: true };
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (host && parsed.host === host) return { ok: true };
    return { ok: false, reason: "untrusted origin" };
  }

  if (fetchSite) {
    return fetchSite === "same-origin" || fetchSite === "none"
      ? { ok: true }
      : { ok: false, reason: `sec-fetch-site: ${fetchSite}` };
  }

  const cookie = request.headers.get("cookie") ?? "";
  if (SESSION_COOKIE.test(cookie)) return { ok: false, reason: "cookie-bearing request without Origin" };
  return { ok: true };
}
