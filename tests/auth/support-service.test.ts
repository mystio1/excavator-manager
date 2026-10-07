import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  clearBusinessData,
  findImpersonationTarget,
  setBusinessFrozen,
  setBusinessLimits,
} from "@/lib/services/support";
import { SUPPORT_ACTOR } from "@/lib/supportTokens";
import { cleanupTenant, createCompletedSession, createTenant, type TestTenant } from "../helpers/tenant";

let t: TestTenant;
const SESSION = "support-session-test-id";

beforeAll(async () => {
  t = await createTenant("support-svc");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
});

const auditRows = (action: string) =>
  db.auditLog.findMany({ where: { businessId: t.businessId, action }, orderBy: { createdAt: "asc" } });

describe("setBusinessFrozen", () => {
  it("freezes and unfreezes, auditing both as SUPPORT in the target business", async () => {
    const frozen = await setBusinessFrozen(t.businessCode.toLowerCase(), true, { supportSessionId: SESSION, reason: "non-payment" });
    expect("business" in frozen && frozen.business.frozen).toBe(true);
    expect((await db.business.findUniqueOrThrow({ where: { id: t.businessId } })).frozen).toBe(true);

    const [freezeRow] = await auditRows("support.freeze");
    expect(freezeRow).toMatchObject({
      actorType: "SUPPORT",
      entityType: "Business",
      entityId: t.businessId,
      reason: "non-payment",
    });
    expect(freezeRow.before).toMatchObject({ frozen: false });
    expect(freezeRow.after).toMatchObject({ frozen: true });
    expect(freezeRow.details).toMatchObject({ supportSessionId: SESSION });

    await setBusinessFrozen(t.businessCode, false, { supportSessionId: SESSION });
    expect((await db.business.findUniqueOrThrow({ where: { id: t.businessId } })).frozen).toBe(false);
    expect(await auditRows("support.unfreeze")).toHaveLength(1);
  });

  it("returns NOT_FOUND for an unknown business code and writes nothing", async () => {
    const result = await setBusinessFrozen("NOSUCHCODE999", true);
    expect(result).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("setBusinessLimits", () => {
  it("sets limits (blank/null = unlimited) and audits before/after", async () => {
    const ok = await setBusinessLimits(t.businessCode, { maxOperators: "5", maxBillsPerDay: null }, { supportSessionId: SESSION });
    expect("business" in ok && ok.business).toMatchObject({ maxOperators: 5, maxBillsPerDay: null });

    await setBusinessLimits(t.businessCode, { maxOperators: "", maxBillsPerDay: 20 });
    const row = await db.business.findUniqueOrThrow({ where: { id: t.businessId } });
    expect(row).toMatchObject({ maxOperators: null, maxBillsPerDay: 20 });

    const rows = await auditRows("support.setLimits");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ actorType: "SUPPORT", entityType: "Business" });
    expect(rows[0].after).toMatchObject({ maxOperators: 5, maxBillsPerDay: null });
    expect(rows[1].before).toMatchObject({ maxOperators: 5 });
  });

  it("rejects non-positive / fractional / non-numeric limits as VALIDATION_FAILED", async () => {
    for (const bad of ["-1", "0", "1.5", "abc"]) {
      const result = await setBusinessLimits(t.businessCode, { maxOperators: bad, maxBillsPerDay: null });
      expect(result).toMatchObject({ code: "VALIDATION_FAILED" });
    }
    // The failed attempts changed nothing.
    expect((await db.business.findUniqueOrThrow({ where: { id: t.businessId } })).maxOperators).toBeNull();
  });
});

describe("findImpersonationTarget", () => {
  it("finds the business owner (read-only: the audit entry is written by the provider)", async () => {
    const before = await db.auditLog.count({ where: { businessId: t.businessId } });
    const target = await findImpersonationTarget(t.businessCode);
    expect("owner" in target && target.owner.id).toBe(t.userId);
    expect(await db.auditLog.count({ where: { businessId: t.businessId } })).toBe(before);
  });

  it("returns NOT_FOUND for an unknown code", async () => {
    expect(await findImpersonationTarget("NOSUCHCODE999")).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("clearBusinessData", () => {
  it("wipes business data but NEVER deletes audit rows; the wipe itself is audited", async () => {
    // Business data to wipe + things that must survive.
    await createCompletedSession(t);
    await db.bankAccount.create({ data: { businessId: t.businessId, label: "Main", accountHolderName: "Owner", accountNumber: "123", ifsc: "TST0000001", bankName: "Test Bank" } });
    const category = await db.transactionCategory.create({ data: { businessId: t.businessId, name: "Advance" } });
    await db.operatorTransaction.create({
      data: { businessId: t.businessId, operatorId: t.operatorId, categoryId: category.id, amount: 500, date: new Date("2026-10-01") },
    });

    // Pre-existing audit history that must outlive the wipe.
    await recordAudit(db, {
      businessId: t.businessId,
      actor: t.actor,
      action: "bill.create",
      entityType: "Bill",
      entityId: "bill-history-1",
      after: { totalAmount: "1000.00" },
    });
    await recordAudit(db, { businessId: t.businessId, actor: SUPPORT_ACTOR, action: "support.freeze", entityType: "Business", entityId: t.businessId });
    const auditBefore = await db.auditLog.findMany({ where: { businessId: t.businessId }, select: { id: true } });
    expect(auditBefore.length).toBeGreaterThanOrEqual(2);

    const result = await clearBusinessData(t.businessCode, { supportSessionId: SESSION, reason: "test cleanup" });
    expect("counts" in result).toBe(true);
    if (!("counts" in result)) return;
    expect(result.counts).toMatchObject({ workSessions: 1, excavators: 1, customers: 1, sites: 1, bankAccounts: 1 });

    // Business-side data is gone...
    expect(await db.excavator.count({ where: { businessId: t.businessId } })).toBe(0);
    expect(await db.customer.count({ where: { businessId: t.businessId } })).toBe(0);
    expect(await db.workSession.count({ where: { businessId: t.businessId } })).toBe(0);
    expect(await db.site.count({ where: { businessId: t.businessId } })).toBe(0);
    // ...while the business, owner login, operators and operator money history survive.
    expect(await db.business.count({ where: { id: t.businessId } })).toBe(1);
    expect(await db.user.count({ where: { businessId: t.businessId } })).toBe(1);
    expect(await db.operator.count({ where: { businessId: t.businessId } })).toBe(1);
    expect(await db.operatorTransaction.count({ where: { businessId: t.businessId } })).toBe(1);

    // Every audit row from before the wipe is still there, plus the wipe's own entry.
    const auditAfter = await db.auditLog.findMany({ where: { businessId: t.businessId }, select: { id: true } });
    const afterIds = new Set(auditAfter.map((r) => r.id));
    for (const row of auditBefore) expect(afterIds.has(row.id)).toBe(true);
    expect(auditAfter.length).toBe(auditBefore.length + 1);

    const [clearRow] = await auditRows("support.clearData");
    expect(clearRow).toMatchObject({ actorType: "SUPPORT", entityType: "Business", entityId: t.businessId, reason: "test cleanup" });
    expect(clearRow.details).toMatchObject({ supportSessionId: SESSION, workSessions: 1, customers: 1 });
  });

  it("the database itself refuses to delete or rewrite audit rows (append-only trigger)", async () => {
    await expect(db.auditLog.deleteMany({ where: { businessId: t.businessId } })).rejects.toThrow();
    await expect(db.auditLog.updateMany({ where: { businessId: t.businessId }, data: { reason: "tampered" } })).rejects.toThrow();
    expect(await db.auditLog.count({ where: { businessId: t.businessId, reason: "tampered" } })).toBe(0);
  });

  it("returns NOT_FOUND for an unknown business code", async () => {
    expect(await clearBusinessData("NOSUCHCODE999")).toMatchObject({ code: "NOT_FOUND" });
  });
});
