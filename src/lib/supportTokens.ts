import crypto from "node:crypto";
import { errorResponse } from "@/lib/api-error";
import type { AuditActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Support-console sessions.
 *
 * These replace the old self-contained HMAC token, which was signed with
 * AUTH_SECRET (the same secret that signs every owner/operator session), could
 * not be revoked, and stayed valid for four hours no matter what. A support
 * session is now an opaque random token whose sha256 lives in the SupportSession
 * table: it expires after one hour, can be revoked (support logout), and is
 * checked against the database on every request — so it can be killed
 * instantly, and leaking AUTH_SECRET no longer mints support access.
 */

export const SUPPORT_SESSION_TTL_MS = 60 * 60 * 1000;

/** Actor recorded on every audit entry the console produces. There is a single
 * shared support credential, so there is no individual id to attribute; the
 * SupportSession id is stored in the entry's `details` instead. */
export const SUPPORT_ACTOR: AuditActor = { type: "SUPPORT", id: null, name: "Support console" };

/** Only the hash is stored: a database leak must not hand out live sessions.
 * A single sha256 pass is enough because the token is 32 random bytes, not a
 * human-chosen secret. */
export function hashSupportToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Creates a session and returns the raw token — the only time it exists in the clear. */
export async function createSupportSession(now: Date = new Date()) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SUPPORT_SESSION_TTL_MS);
  const row = await db.supportSession.create({ data: { tokenHash: hashSupportToken(token), expiresAt } });

  // Housekeeping: dead sessions are useless after a day; drop them as we go.
  db.supportSession
    .deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } })
    .catch((err: unknown) => logger.warn("support session cleanup failed", { error: String(err) }));

  return { token, expiresAt, id: row.id };
}

/** The live session for a raw token: exists, not revoked, not expired. */
export async function findActiveSupportSession(token: string) {
  if (!token || token.length > 512) return null;
  return db.supportSession.findFirst({
    where: { tokenHash: hashSupportToken(token), revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, expiresAt: true },
  });
}

export async function verifySupportToken(token: string): Promise<boolean> {
  return (await findActiveSupportSession(token)) !== null;
}

/** Is this SupportSession id still live? Used to cut off owner sessions that
 * were opened by impersonation the moment the support session ends. */
export async function isSupportSessionActive(sessionId: string): Promise<boolean> {
  const row = await db.supportSession.findFirst({
    where: { id: sessionId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return row !== null;
}

/** Revokes by raw token. Idempotent; returns whether a live session was ended. */
export async function revokeSupportToken(token: string): Promise<boolean> {
  if (!token || token.length > 512) return false;
  const result = await db.supportSession.updateMany({
    where: { tokenHash: hashSupportToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

/** Extracts the token from an `Authorization: Bearer <token>` header. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
}

/** api-auth.ts's requireBusinessApi()/requireOperatorApi() analogue for
 * support-console routes — every one of them starts with this same check. */
export async function requireSupportApi(req: Request) {
  const token = bearerToken(req);
  const session = token ? await findActiveSupportSession(token) : null;
  if (!token || !session) {
    return {
      token: null,
      session: null,
      actor: null,
      error: errorResponse("UNAUTHORIZED", "Support session expired — log in again"),
    } as const;
  }
  return { token, session, actor: SUPPORT_ACTOR, error: null } as const;
}
