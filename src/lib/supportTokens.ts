import crypto from "node:crypto";
import { NextResponse } from "next/server";

interface SupportPayload {
  support: true;
  exp: number;
}

const FOUR_HOURS_MS = 1000 * 60 * 60 * 4;

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Signed with AUTH_SECRET (the same secret Auth.js already uses to sign
 * owner/operator session JWTs) but with a distinct HMAC input
 * (`support:${encoded}` vs. a session token's own encoding) so a support
 * token and a normal session token can never be confused for each other
 * even though they share the same secret. */
export function createSupportToken(secret: string): string {
  const payload: SupportPayload = { support: true, exp: Date.now() + FOUR_HOURS_MS };
  const encoded = base64url(payload);
  const sig = crypto.createHmac("sha256", secret).update(`support:${encoded}`).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySupportToken(token: string, secret: string): boolean {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 2) return false;
    const [encoded, sig] = parts;
    const expected = crypto.createHmac("sha256", secret).update(`support:${encoded}`).digest("base64url");
    if (expected.length !== sig.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SupportPayload;
    return Boolean(payload.support) && payload.exp > Date.now();
  } catch {
    return false;
  }
}

/** Extracts the token from an `Authorization: Bearer <token>` header. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

/** api-auth.ts's requireBusinessApi()/requireOperatorApi() analogue for
 * support-console routes — every one of them starts with this same check. */
export function requireSupportApi(req: Request) {
  const token = bearerToken(req);
  if (!token || !process.env.AUTH_SECRET || !verifySupportToken(token, process.env.AUTH_SECRET)) {
    return { token: null, error: NextResponse.json({ error: "Support session expired — log in again" }, { status: 401 }) } as const;
  }
  return { token, error: null } as const;
}
