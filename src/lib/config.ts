/**
 * Central, trusted configuration. Anything security-relevant that used to be
 * derived from request headers (reset-link host, allowed origins) is read from
 * the environment here instead.
 */

export const isProduction = process.env.NODE_ENV === "production";

/** Capacitor's Android WebView serves the bundled app from this origin
 * (see capacitor.config.ts / src/proxy.ts). Its API calls to the deployed
 * server are cross-origin and therefore carry `Origin: https://localhost`. */
export const CAPACITOR_ANDROID_ORIGIN = "https://localhost";

const DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001"];

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** The public base URL of this deployment, e.g. https://excavator.trackmarg.in.
 * Required in production: password-reset emails are built from it, never from
 * the incoming Host header (host-header poisoning). */
export function appUrl(): string {
  const fromEnv = originOf(process.env.APP_URL);
  if (fromEnv) return fromEnv;
  if (isProduction) {
    throw new Error("APP_URL must be set in production (e.g. https://your-domain.example)");
  }
  return "http://localhost:3000";
}

/** Origins allowed to make state-changing requests with the user's cookies:
 * this deployment (APP_URL), anything listed in ALLOWED_ORIGINS (comma
 * separated, e.g. a second domain or the onrender.com URL), and the Capacitor
 * Android app. Same-host requests are additionally accepted by the CSRF check
 * itself (Origin host === Host header). */
export function trustedOrigins(): Set<string> {
  const set = new Set<string>([CAPACITOR_ANDROID_ORIGIN]);
  const app = originOf(process.env.APP_URL);
  if (app) set.add(app);
  for (const raw of (process.env.ALLOWED_ORIGINS ?? "").split(",")) {
    const o = originOf(raw.trim());
    if (o) set.add(o);
  }
  if (!isProduction) for (const o of DEV_ORIGINS) set.add(o);
  return set;
}

/** Number of reverse proxies in front of the app that append to
 * X-Forwarded-For. The client IP is the entry that many positions from the
 * RIGHT — everything to its left is client-controlled and spoofable. Render
 * terminates TLS at its own proxy layer, so 1 is the default; adjust if you put
 * another proxy/CDN (e.g. Cloudflare) in front. */
export function trustedProxyHops(): number {
  const n = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
}
