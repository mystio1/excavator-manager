/** Minimal in-memory rate limiter — fine for a single Node process (this
 * app has no multi-instance deployment), and deliberately not shared
 * infrastructure since this is the only route in the app that currently
 * needs it: the support-console password gate, which unlocks every tenant
 * on the platform if brute-forced. */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > maxAttempts;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
