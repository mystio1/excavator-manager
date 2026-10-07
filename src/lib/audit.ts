import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getContext } from "@/lib/request-context";

/**
 * Append-only financial audit trail.
 *
 * Every create / update / delete of a money-bearing or operationally important
 * record writes ONE AuditLog row — inside the SAME transaction as the change
 * (pass the `tx`), so the record and its audit entry commit or roll back
 * together. The table is append-only at the database level (trigger in the
 * 20261004091000_security_and_integrity migration): not even a compromised
 * session can rewrite history through the app's database role.
 *
 * Snapshots (`before` / `after`) are stored as JSON with Decimals as exact
 * strings and with credentials/tokens stripped by redactForAudit().
 */

export type AuditActor = {
  type: "OWNER" | "OPERATOR" | "SUPPORT" | "SYSTEM";
  /** User.id for OWNER; Operator.id for OPERATOR; null for SUPPORT/SYSTEM. */
  id: string | null;
  /** Display name stored with the entry so the trail stays readable even if the user is later removed. */
  name: string;
};

export const SYSTEM_ACTOR: AuditActor = { type: "SYSTEM", id: null, name: "system" };

type AuditClient = Prisma.TransactionClient | typeof db;

export type AuditEntry = {
  businessId: string;
  actor: AuditActor;
  /** Dotted verb, e.g. "bill.create", "bill.update", "payment.delete". */
  action: string;
  /** Model/entity name, e.g. "Bill", "Payment", "WorkSession". */
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  /** Free-form extra context (never secrets). */
  details?: Record<string, unknown>;
};

const SECRET_KEY = /pass(word)?hash|pinhash|apppin|resettoken|verificationhash|secret|^token$|tokenhash|accesstoken|refreshtoken|authorization/i;

/** Deep, JSON-safe copy: Decimal → exact string, Date → ISO, secrets removed. */
export function redactForAudit(value: unknown, depth = 0): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (depth > 6) return "[truncated]";
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((v) => redactForAudit(v, depth + 1)) as Prisma.InputJsonArray;
  if (typeof value === "object") {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) continue;
      out[k] = redactForAudit(v, depth + 1);
    }
    return out as Prisma.InputJsonObject;
  }
  return value as Prisma.InputJsonValue;
}

const toJson = (v: unknown) => {
  const r = redactForAudit(v);
  return r === null ? Prisma.JsonNull : r;
};

/** Writes one audit row. Always pass the surrounding transaction client when
 * there is one. Throws on failure on purpose: a financial change that cannot
 * be audited must not be committed. */
export async function recordAudit(client: AuditClient, entry: AuditEntry) {
  const ctx = getContext();
  await client.auditLog.create({
    data: {
      businessId: entry.businessId,
      userId: entry.actor.type === "OWNER" ? entry.actor.id : null,
      userName: entry.actor.name,
      actorType: entry.actor.type,
      actorId: entry.actor.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? Prisma.JsonNull : toJson(entry.before),
      after: entry.after === undefined ? Prisma.JsonNull : toJson(entry.after),
      reason: entry.reason ?? null,
      requestId: ctx?.requestId ?? null,
      details: (redactForAudit({
        ...(entry.details ?? {}),
        // Impersonation: which support session did this, on behalf of which owner account.
        ...(ctx?.supportSessionId
          ? { supportSessionId: ctx.supportSessionId, onBehalfOfUserId: ctx.onBehalfOfUserId }
          : {}),
      }) ?? {}) as Prisma.InputJsonObject,
    },
  });
}

/** Test/maintenance helper: lets the current transaction delete audit rows
 * (see the trigger in the security_and_integrity migration). Never call from
 * request handlers. */
export async function allowAuditPurgeInTransaction(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT set_config('app.allow_audit_purge', 'on', true)`;
}
