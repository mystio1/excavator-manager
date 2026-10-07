import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSupportSessionActive } from "@/lib/supportTokens";
import type { OperatorLang } from "@/lib/i18n/operator";

/**
 * Resolves the current session to a business, or null if either there's no
 * session or it's no longer valid. A JWT is self-contained and would otherwise
 * stay usable until it expires (30 days), so every use is checked against the
 * database:
 *   - the User row must still exist (deleted accounts lose access at once);
 *   - the token's tokenVersion must equal User.tokenVersion (a password reset
 *     or change bumps it, which revokes every session issued before);
 *   - the user must still belong to the business the token names (also covers
 *     a business row restored from an older backup or a dev database reset).
 * All of that is ONE query (the user plus its business via the relation), so
 * the check costs no extra round trip. Doesn't redirect itself: the (auth) and
 * (app) route groups need opposite reactions to "no valid session" (let them
 * see login vs. bounce them to login), so they each redirect based on this
 * shared check instead of duplicating it.
 *
 * Wrapped in React's cache() — every layout, page, and server action on a
 * request calls this independently (62 call sites), and without per-request
 * memoization each one re-runs the underlying query, all hitting the same
 * row. cache() collapses that to one query per request.
 */
export const getValidBusinessSession = cache(async function getValidBusinessSession() {
  const session = await auth();
  // role must be OWNER here — an Operator-portal JWT carries the same
  // session shape (businessId + role) but must never be treated as valid
  // for the owner app, even though its businessId does resolve to a real row.
  if (!session?.user || session.user.role !== "OWNER") return null;

  // Selects name/ownerName too, not just id — (app)/layout.tsx needs both on
  // every page for the sidebar/header, and this query is already cached
  // per-request, so folding them in here avoids a second round-trip to fetch
  // the same row a second time.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      tokenVersion: true,
      businessId: true,
      business: { select: { id: true, name: true, ownerName: true, frozen: true } },
    },
  });
  if (!user) return null;
  // Tokens issued before tokenVersion existed carry none: treated as version 0,
  // so they stay valid until the account's first revocation.
  if (user.tokenVersion !== (session.user.tokenVersion ?? 0)) return null;
  if (user.role !== "OWNER" || user.businessId !== session.user.businessId) return null;

  // A session opened by support impersonation lives only as long as the
  // support session that opened it (logout / expiry ends it immediately).
  // Ordinary sessions skip this entirely.
  const supportSessionId = session.user.supportSessionId ?? null;
  if (supportSessionId && !(await isSupportSessionActive(supportSessionId))) return null;

  return {
    userId: user.id,
    businessId: user.businessId,
    businessName: user.business.name,
    ownerName: user.business.ownerName,
    businessFrozen: user.business.frozen,
    /** Non-null when support is "in" as this owner (so audit/UI can tell). */
    supportSessionId,
  };
});

/**
 * Every page/action in the (app) route group calls this first. It is the
 * single choke point that scopes all data access to the signed-in business —
 * service functions take businessId explicitly rather than looking it up
 * themselves, so a call site can never accidentally query across tenants.
 */
export async function requireBusiness() {
  const valid = await getValidBusinessSession();
  if (!valid) {
    redirect("/login");
  }
  return valid;
}

/** Operator-portal analogue of getValidBusinessSession — session.user.id is
 * the Operator's id (see the "operator" Credentials provider in auth.ts).
 * Re-checks the Operator row on every call so a login disabled or an
 * operator archived from the Admin side takes effect immediately, and a
 * changed PIN (which bumps Operator.tokenVersion) signs out every session
 * issued before it. Also cache()'d per-request for the same reason as
 * getValidBusinessSession. */
export const getValidOperatorSession = cache(async function getValidOperatorSession() {
  const session = await auth();
  if (!session?.user || session.user.role !== "OPERATOR") return null;

  const operator = await db.operator.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      businessId: true,
      canLogin: true,
      isArchived: true,
      language: true,
      tokenVersion: true,
      business: { select: { operatorLanguage: true, frozen: true } },
    },
  });
  if (!operator || !operator.canLogin || operator.isArchived) return null;
  if (operator.businessId !== session.user.businessId) return null;
  if (operator.tokenVersion !== (session.user.tokenVersion ?? 0)) return null;

  return {
    operatorId: operator.id,
    businessId: operator.businessId,
    // The operator's own choice (set from their portal home page) wins when
    // present; otherwise the admin's business-wide default from Settings —
    // see prisma/schema.prisma's comments on Operator.language and
    // Business.operatorLanguage for why neither applies pre-login.
    operatorLang: (operator.language ?? operator.business.operatorLanguage) as OperatorLang,
    businessFrozen: operator.business.frozen,
  };
});

export async function requireOperator() {
  const valid = await getValidOperatorSession();
  if (!valid) {
    redirect("/operator-login");
  }
  return valid;
}
