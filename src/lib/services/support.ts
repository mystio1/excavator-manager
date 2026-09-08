import { db } from "@/lib/db";
import { normalizeBusinessCode } from "@/lib/utils/businessCode";

async function createAuditLog(
  businessId: string,
  action: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  const owner = await db.user.findFirst({ where: { businessId, role: "OWNER" }, orderBy: { createdAt: "asc" } });
  await db.auditLog.create({
    data: {
      businessId,
      userId: owner?.id ?? null,
      userName: owner?.name ?? "(no admin account)",
      action,
      entityId,
      details: details as object,
    },
  });
}

/** Every business on the platform, with the same at-a-glance stats the
 * support console's business directory shows. Not scoped by businessId —
 * this is the one legitimate cross-tenant read in the whole app, gated
 * entirely by the caller having already verified a support token. */
export async function listBusinessesForSupport() {
  const businesses = await db.business.findMany({ orderBy: { name: "asc" } });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return Promise.all(
    businesses.map(async (business) => {
      const [userCount, operatorCount, customerCount, excavatorCount, billsToday] = await Promise.all([
        db.user.count({ where: { businessId: business.id } }),
        db.operator.count({ where: { businessId: business.id, isArchived: false } }),
        db.customer.count({ where: { businessId: business.id, isArchived: false } }),
        db.excavator.count({ where: { businessId: business.id, isArchived: false } }),
        db.bill.count({ where: { businessId: business.id, createdAt: { gte: startOfToday } } }),
      ]);
      return {
        id: business.id,
        code: business.code,
        name: business.name,
        createdAt: business.createdAt,
        frozen: business.frozen,
        maxOperators: business.maxOperators,
        maxBillsPerDay: business.maxBillsPerDay,
        userCount,
        operatorCount,
        customerCount,
        excavatorCount,
        billsToday,
      };
    }),
  );
}

/** The user impersonate signs in as — always the business's longest-standing
 * owner account, matching listBusinessesForSupport's userCount (every User
 * row, not just one). Returns null if the business has no owner account
 * left to access (shouldn't normally happen, but a business is never left
 * completely inaccessible from support's perspective by construction). */
export async function findImpersonationTarget(businessCode: string) {
  const business = await db.business.findUnique({ where: { code: normalizeBusinessCode(businessCode) } });
  if (!business) return { error: "No business found with that code" } as const;

  const owner = await db.user.findFirst({ where: { businessId: business.id, role: "OWNER" }, orderBy: { createdAt: "asc" } });
  if (!owner) return { error: "This business has no admin account to access" } as const;

  await createAuditLog(business.id, "support.impersonate", owner.id);
  return { business, owner } as const;
}

/** Locks/unlocks a business — enforced server-side on every API route (see
 * requireBusinessApi), not just a frontend overlay. Takes effect for a
 * signed-in owner the next time their client polls /api/layout (this app
 * has no real-time push channel, so it isn't instant the way the reference
 * app's SSE-based freeze is — the next poll interval, typically well under
 * a minute, is the ceiling here). */
export async function setBusinessFrozen(businessCode: string, frozen: boolean) {
  const business = await db.business.findUnique({ where: { code: normalizeBusinessCode(businessCode) } });
  if (!business) return { error: "No business found with that code" } as const;

  const updated = await db.business.update({ where: { id: business.id }, data: { frozen } });
  await createAuditLog(business.id, frozen ? "support.freeze" : "support.unfreeze", business.id);
  return { business: updated } as const;
}

function parseLimit(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${label} must be a positive whole number, or left blank for unlimited`);
  }
  return n;
}

/** null/blank means unlimited. Enforced at operator creation (see
 * createOperator in operators.ts) and bill creation (see createBill and
 * createDirectBill in bills.ts) respectively. */
export async function setBusinessLimits(
  businessCode: string,
  input: { maxOperators?: unknown; maxBillsPerDay?: unknown },
) {
  const business = await db.business.findUnique({ where: { code: normalizeBusinessCode(businessCode) } });
  if (!business) return { error: "No business found with that code" } as const;

  let maxOperators: number | null;
  let maxBillsPerDay: number | null;
  try {
    maxOperators = parseLimit(input.maxOperators, "Max operators");
    maxBillsPerDay = parseLimit(input.maxBillsPerDay, "Max bills per day");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid limit" } as const;
  }

  const updated = await db.business.update({ where: { id: business.id }, data: { maxOperators, maxBillsPerDay } });
  await createAuditLog(business.id, "support.setLimits", business.id, { maxOperators, maxBillsPerDay });
  return { business: updated } as const;
}
