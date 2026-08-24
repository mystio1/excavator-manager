import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { OperatorLang } from "@/lib/i18n/operator";

/**
 * Resolves the current session to a business, or null if either there's no
 * session or it's stale — a JWT can outlive the Business row it points at
 * (e.g. restoring from an older backup, or a dev database reset). Doesn't
 * redirect itself: the (auth) and (app) route groups need opposite reactions
 * to "no valid session" (let them see login vs. bounce them to login), so
 * they each redirect based on this shared check instead of duplicating it.
 *
 * Wrapped in React's cache() — every layout, page, and server action on a
 * request calls this independently (62 call sites), and without per-request
 * memoization each one re-runs the underlying business-existence query, all
 * hitting the same row. cache() collapses that to one query per request.
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
  const business = await db.business.findUnique({
    where: { id: session.user.businessId },
    select: { id: true, name: true, ownerName: true },
  });
  if (!business) return null;

  return {
    userId: session.user.id,
    businessId: session.user.businessId,
    businessName: business.name,
    ownerName: business.ownerName,
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
 * operator archived from the Admin side takes effect immediately. Also
 * cache()'d per-request for the same reason as getValidBusinessSession. */
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
      business: { select: { operatorLanguage: true } },
    },
  });
  if (!operator || !operator.canLogin || operator.isArchived) return null;
  if (operator.businessId !== session.user.businessId) return null;

  return {
    operatorId: operator.id,
    businessId: operator.businessId,
    // The operator's own choice (set from their portal home page) wins when
    // present; otherwise the admin's business-wide default from Settings —
    // see prisma/schema.prisma's comments on Operator.language and
    // Business.operatorLanguage for why neither applies pre-login.
    operatorLang: (operator.language ?? operator.business.operatorLanguage) as OperatorLang,
  };
});

export async function requireOperator() {
  const valid = await getValidOperatorSession();
  if (!valid) {
    redirect("/operator-login");
  }
  return valid;
}
