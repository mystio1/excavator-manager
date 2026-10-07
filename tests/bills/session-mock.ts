import type { TestTenant } from "../helpers/tenant";

/**
 * Stands in for "@/lib/session" in route-level tests (the real one reads the
 * NextAuth cookie). Use it from a test file as
 *
 *   vi.mock("@/lib/session", () => import("./session-mock"));
 *
 * and call actAs(tenant) to sign in as that tenant's owner (actAs(null) = not
 * signed in). Everything above the session - requireBusinessApi, withApi,
 * parseBody, runIdempotent, the services - is the real code.
 */

type MockSession = {
  userId: string;
  businessId: string;
  businessName: string;
  ownerName: string;
  businessFrozen: boolean;
  supportSessionId: string | null;
};

let current: MockSession | null = null;

export function actAs(tenant: TestTenant | null, opts: { frozen?: boolean } = {}) {
  current = tenant
    ? {
        userId: tenant.userId,
        businessId: tenant.businessId,
        businessName: "Test Business",
        ownerName: tenant.actor.name,
        businessFrozen: opts.frozen ?? false,
        supportSessionId: null,
      }
    : null;
}

export async function getValidBusinessSession() {
  return current;
}

export async function getValidOperatorSession() {
  return null;
}
