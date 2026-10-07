import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { dec } from "@/lib/money";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  listTransactionsPage,
  updateTransaction,
} from "@/lib/services/operatorTransactions";
import {
  createTransactionBodySchema,
  updateTransactionSchema,
  type AddTransactionInput,
} from "@/lib/validation/operatorTransaction";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";

/**
 * Operator money records: every add / update / delete commits an audit row in
 * the same transaction, updates are guarded by optimistic concurrency, amounts
 * are exact, and nothing crosses a tenant boundary.
 */

let t: TestTenant;
let other: TestTenant;

const baseInput = (over: Partial<AddTransactionInput> = {}): AddTransactionInput => ({
  operatorId: t.operatorId,
  amount: 100.1,
  date: "2026-10-02",
  businessEffect: "ADVANCE_RECOVERABLE",
  deductFromSalary: true,
  ...over,
});

async function auditFor(entityId: string) {
  return db.auditLog.findMany({
    where: { businessId: t.businessId, entityType: "OperatorTransaction", entityId },
    orderBy: { createdAt: "asc" },
  });
}

/** Narrows a service result to its success value (and fails the test otherwise). */
function ok<T>(result: T): Exclude<T, { error: string }> {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`expected success, got ${JSON.stringify(result)}`);
  }
  return result as Exclude<T, { error: string }>;
}

beforeAll(async () => {
  t = await createTenant("optx");
  other = await createTenant("optx-other");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await cleanupTenant(other.businessId);
});

describe("createTransaction", () => {
  it("stores the amount exactly and writes a create audit row with the after snapshot", async () => {
    const created = ok(await createTransaction(t.businessId, t.actor, baseInput({ amount: 0.3, notes: "advance" })));
    expect(dec(created.amount).eq("0.30")).toBe(true);
    expect(created.version).toBe(0);
    expect(created.businessId).toBe(t.businessId);

    const stored = await db.operatorTransaction.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.amount.toString()).toBe("0.3");

    const audit = await auditFor(created.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "operator.transaction.create",
      entityType: "OperatorTransaction",
      entityId: created.id,
      actorType: "OWNER",
      actorId: t.userId,
      userId: t.userId,
    });
    expect(audit[0]!.before).toBeNull();
    // Decimals are stored in the snapshot as exact strings.
    expect(audit[0]!.after).toMatchObject({ id: created.id, amount: "0.3", businessEffect: "ADVANCE_RECOVERABLE", notes: "advance" });
    expect(audit[0]!.details).toMatchObject({ operatorId: t.operatorId });
  });

  it("rounds a sub-paisa amount half-up at the service boundary (validation rejects it earlier)", async () => {
    const created = ok(await createTransaction(t.businessId, t.actor, baseInput({ amount: 10.005 })));
    expect(created.amount.toString()).toBe("10.01");
  });

  it("an unknown operator is NOT_FOUND and leaves no row or audit entry", async () => {
    const before = await db.auditLog.count({ where: { businessId: t.businessId } });
    const result = await createTransaction(t.businessId, t.actor, baseInput({ operatorId: "does-not-exist" }));
    expect(result).toMatchObject({ code: "NOT_FOUND" });
    expect(await db.auditLog.count({ where: { businessId: t.businessId } })).toBe(before);
  });

  it("another tenant's operator is NOT_FOUND — nothing is created in either tenant", async () => {
    const result = await createTransaction(t.businessId, t.actor, baseInput({ operatorId: other.operatorId }));
    expect(result).toMatchObject({ code: "NOT_FOUND" });
    expect(await db.operatorTransaction.count({ where: { operatorId: other.operatorId } })).toBe(0);
  });

  it("another tenant's category is NOT_FOUND and is never attached", async () => {
    const foreign = await db.transactionCategory.create({ data: { businessId: other.businessId, name: "Foreign" } });
    const result = await createTransaction(t.businessId, t.actor, baseInput({ categoryId: foreign.id }));
    expect(result).toMatchObject({ code: "NOT_FOUND" });
  });

  it("a custom category name is created once and reused (case-insensitive) by later transactions", async () => {
    const first = ok(await createTransaction(t.businessId, t.actor, baseInput({ newCategoryName: "Tea Money" })));
    const second = ok(await createTransaction(t.businessId, t.actor, baseInput({ newCategoryName: "tea money" })));
    expect(first.categoryId).toBeTruthy();
    expect(second.categoryId).toBe(first.categoryId);
    expect(await db.transactionCategory.count({ where: { businessId: t.businessId, name: { equals: "tea money", mode: "insensitive" } } })).toBe(1);
  });

  it("is atomic with its audit entry: rolling back the outer transaction removes both", async () => {
    const marker = "rollback-marker";
    await expect(
      db.$transaction(async (tx) => {
        ok(await createTransaction(t.businessId, t.actor, baseInput({ notes: marker }), { tx }));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await db.operatorTransaction.count({ where: { businessId: t.businessId, notes: marker } })).toBe(0);
    expect(await db.auditLog.count({ where: { businessId: t.businessId, action: "operator.transaction.create", after: { path: ["notes"], equals: marker } } })).toBe(0);
  });
});

describe("updateTransaction", () => {
  it("updates the row, bumps the version and writes an audit row with before AND after", async () => {
    const created = ok(await createTransaction(t.businessId, t.actor, baseInput({ amount: 250.5, notes: "first" })));
    const updated = ok(
      await updateTransaction(
        t.businessId,
        t.actor,
        created.id,
        {
          amount: 300.25,
          date: "2026-10-03",
          notes: "second",
          businessEffect: "SALARY_PAYMENT",
          deductFromSalary: false,
          expectedVersion: 0,
        },
        { operatorId: t.operatorId },
      ),
    );
    expect(updated.version).toBe(1);
    expect(updated.amount.toString()).toBe("300.25");
    expect(updated.businessEffect).toBe("SALARY_PAYMENT");
    expect(updated.deductFromSalary).toBe(false);

    const audit = await auditFor(created.id);
    expect(audit.map((a) => a.action)).toEqual(["operator.transaction.create", "operator.transaction.update"]);
    const row = audit[1]!;
    expect(row.before).toMatchObject({ amount: "250.5", notes: "first", businessEffect: "ADVANCE_RECOVERABLE", version: 0 });
    expect(row.after).toMatchObject({ amount: "300.25", notes: "second", businessEffect: "SALARY_PAYMENT", version: 1 });
    expect(row.actorType).toBe("OWNER");
  });

  it("a stale expectedVersion is RESOURCE_MODIFIED: nothing changes and no audit row is written", async () => {
    const created = ok(await createTransaction(t.businessId, t.actor, baseInput({ amount: 50 })));
    // Someone else edits first.
    ok(await updateTransaction(t.businessId, t.actor, created.id, { ...baseInput({ amount: 60 }), expectedVersion: 0 }));

    const stale = await updateTransaction(t.businessId, t.actor, created.id, { ...baseInput({ amount: 999 }), expectedVersion: 0 });
    expect(stale).toMatchObject({ code: "RESOURCE_MODIFIED" });
    expect("error" in stale && typeof stale.error).toBe("string");

    const stored = await db.operatorTransaction.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.amount.toString()).toBe("60");
    expect(stored.version).toBe(1);
    expect(await auditFor(created.id)).toHaveLength(2); // create + the one winning update
  });

  it("a current expectedVersion succeeds repeatedly; each write increments the version by one", async () => {
    const created = ok(await createTransaction(t.businessId, t.actor, baseInput()));
    for (let v = 0; v < 3; v++) {
      const next = ok(await updateTransaction(t.businessId, t.actor, created.id, { ...baseInput({ amount: 10 + v }), expectedVersion: v }));
      expect(next.version).toBe(v + 1);
    }
  });

  it("an omitted expectedVersion (older installed apps) skips the check but still bumps the version", async () => {
    const created = ok(await createTransaction(t.businessId, t.actor, baseInput()));
    ok(await updateTransaction(t.businessId, t.actor, created.id, baseInput({ amount: 11 })));
    const again = ok(await updateTransaction(t.businessId, t.actor, created.id, baseInput({ amount: 12 })));
    expect(again.version).toBe(2);
  });

  it("two concurrent edits from the same version: exactly one wins, the other gets RESOURCE_MODIFIED", async () => {
    const created = ok(await createTransaction(t.businessId, t.actor, baseInput({ amount: 1 })));
    const results = await Promise.all([
      updateTransaction(t.businessId, t.actor, created.id, { ...baseInput({ amount: 2 }), expectedVersion: 0 }),
      updateTransaction(t.businessId, t.actor, created.id, { ...baseInput({ amount: 3 }), expectedVersion: 0 }),
    ]);
    const winners = results.filter((r) => !("error" in r));
    const losers = results.filter((r) => "error" in r);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toMatchObject({ code: "RESOURCE_MODIFIED" });
    const stored = await db.operatorTransaction.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.version).toBe(1);
    expect(await auditFor(created.id)).toHaveLength(2);
  });

  it("tenant isolation: another tenant's transaction is NOT_FOUND and stays untouched", async () => {
    const theirs = ok(await createTransaction(other.businessId, other.actor, baseInput({ operatorId: other.operatorId, amount: 777 })));
    const attempt = await updateTransaction(t.businessId, t.actor, theirs.id, baseInput({ amount: 1 }));
    expect(attempt).toMatchObject({ code: "NOT_FOUND" });
    const stored = await db.operatorTransaction.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(stored.amount.toString()).toBe("777");
    expect(stored.version).toBe(0);
    // No audit row was written in the attacker's tenant for that entity.
    expect(await db.auditLog.count({ where: { businessId: t.businessId, entityId: theirs.id } })).toBe(0);
  });

  it("the URL's operator must own the transaction: a mismatched operator id is NOT_FOUND", async () => {
    const second = await db.operator.create({ data: { businessId: t.businessId, name: "Second Op", mobile: "9555555555" } });
    const created = ok(await createTransaction(t.businessId, t.actor, baseInput()));
    const attempt = await updateTransaction(t.businessId, t.actor, created.id, baseInput({ amount: 5 }), { operatorId: second.id });
    expect(attempt).toMatchObject({ code: "NOT_FOUND" });
    const removal = await deleteTransaction(t.businessId, t.actor, created.id, { operatorId: second.id });
    expect(removal).toMatchObject({ code: "NOT_FOUND" });
    expect(await db.operatorTransaction.count({ where: { id: created.id } })).toBe(1);
  });
});

describe("deleteTransaction", () => {
  it("deletes the row and writes an audit row carrying the before snapshot", async () => {
    const created = ok(await createTransaction(t.businessId, t.actor, baseInput({ amount: 42.42, notes: "to delete" })));
    const removed = ok(await deleteTransaction(t.businessId, t.actor, created.id, { operatorId: t.operatorId }));
    expect(removed).toEqual({ ok: true, id: created.id });
    expect(await db.operatorTransaction.count({ where: { id: created.id } })).toBe(0);

    const audit = await auditFor(created.id);
    expect(audit.map((a) => a.action)).toEqual(["operator.transaction.create", "operator.transaction.delete"]);
    const row = audit[1]!;
    expect(row.before).toMatchObject({ id: created.id, amount: "42.42", notes: "to delete" });
    expect(row.after).toBeNull();
    expect(row.details).toMatchObject({ operatorId: t.operatorId });
  });

  it("deleting twice: the second attempt is NOT_FOUND and writes no extra audit row", async () => {
    const created = ok(await createTransaction(t.businessId, t.actor, baseInput()));
    ok(await deleteTransaction(t.businessId, t.actor, created.id));
    const again = await deleteTransaction(t.businessId, t.actor, created.id);
    expect(again).toMatchObject({ code: "NOT_FOUND" });
    expect((await auditFor(created.id)).filter((a) => a.action === "operator.transaction.delete")).toHaveLength(1);
  });

  it("tenant isolation: another tenant's transaction cannot be deleted", async () => {
    const theirs = ok(await createTransaction(other.businessId, other.actor, baseInput({ operatorId: other.operatorId })));
    const attempt = await deleteTransaction(t.businessId, t.actor, theirs.id);
    expect(attempt).toMatchObject({ code: "NOT_FOUND" });
    expect(await db.operatorTransaction.count({ where: { id: theirs.id } })).toBe(1);
  });
});

describe("listing", () => {
  it("pages newest first with a stable cursor and never leaks another tenant's rows", async () => {
    const own = await createTenant("optx-page");
    try {
      for (let i = 1; i <= 5; i++) {
        ok(await createTransaction(own.businessId, own.actor, { ...baseInput({ amount: i, date: `2026-09-0${i}` }), operatorId: own.operatorId }));
      }
      ok(await createTransaction(other.businessId, other.actor, baseInput({ operatorId: other.operatorId })));

      const first = await listTransactionsPage(own.businessId, own.operatorId, { limit: 2, cursor: undefined });
      expect(first.items.map((r) => r.amount.toString())).toEqual(["5", "4"]);
      expect(first.nextCursor).toBeTruthy();
      const second = await listTransactionsPage(own.businessId, own.operatorId, { limit: 2, cursor: first.nextCursor ?? undefined });
      expect(second.items.map((r) => r.amount.toString())).toEqual(["3", "2"]);
      const last = await listTransactionsPage(own.businessId, own.operatorId, { limit: 2, cursor: second.nextCursor ?? undefined });
      expect(last.items.map((r) => r.amount.toString())).toEqual(["1"]);
      expect(last.nextCursor).toBeNull();

      // The legacy (array) shape stays available and is scoped the same way.
      expect(await listTransactions(own.businessId, own.operatorId)).toHaveLength(5);
      expect(await listTransactions(own.businessId, other.operatorId)).toHaveLength(0);
    } finally {
      await cleanupTenant(own.businessId);
    }
  });
});

describe("validation schemas", () => {
  const valid = { amount: 100.5, date: "2026-10-02", businessEffect: "BUSINESS_EXPENSE" };

  it("accepts whole rupees and paise, rejects sub-paisa precision, zero, negatives and huge amounts", () => {
    expect(createTransactionBodySchema.safeParse({ ...valid, amount: 100 }).success).toBe(true);
    expect(createTransactionBodySchema.safeParse({ ...valid, amount: "0.07" }).success).toBe(true);
    expect(createTransactionBodySchema.safeParse({ ...valid, amount: 10.123 }).success).toBe(false);
    expect(createTransactionBodySchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(createTransactionBodySchema.safeParse({ ...valid, amount: -5 }).success).toBe(false);
    expect(createTransactionBodySchema.safeParse({ ...valid, amount: 1e15 }).success).toBe(false);
  });

  it('treats the string "false" as false (z.coerce.boolean would make it true)', () => {
    const parsed = createTransactionBodySchema.parse({ ...valid, deductFromSalary: "false" });
    expect(parsed.deductFromSalary).toBe(false);
    expect(createTransactionBodySchema.safeParse({ ...valid, deductFromSalary: "maybe" }).success).toBe(false);
  });

  it("rejects an unknown businessEffect and an unparseable date", () => {
    expect(createTransactionBodySchema.safeParse({ ...valid, businessEffect: "FREE_MONEY" }).success).toBe(false);
    expect(createTransactionBodySchema.safeParse({ ...valid, date: "not-a-date" }).success).toBe(false);
  });

  it("expectedVersion is optional and must be a non-negative integer", () => {
    expect(updateTransactionSchema.safeParse(valid).success).toBe(true);
    expect(updateTransactionSchema.safeParse({ ...valid, expectedVersion: 3 }).success).toBe(true);
    expect(updateTransactionSchema.safeParse({ ...valid, expectedVersion: -1 }).success).toBe(false);
    expect(updateTransactionSchema.safeParse({ ...valid, expectedVersion: 1.5 }).success).toBe(false);
  });
});
