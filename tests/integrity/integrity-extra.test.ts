import "../bills/pool";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { db } from "@/lib/db";
import { addPayment, createSummaryBill } from "@/lib/services/bills";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { ok, summaryInput, uniq } from "../bills/helpers";
// Plain ESM shared with scripts/audit-integrity.mjs (`npm run audit:integrity`).
import { CHECKS, CONTROL_CHECKS, orphanCheck } from "../../scripts/lib/integrity-checks.mjs";

/**
 * Second half of the integrity-checker proof (the first half is integrity.test.ts):
 *   1. the tenant/reference rules added for the remaining tables detect their own corruption;
 *   2. every database-control check FAILS when its trigger / constraint / index is removed — shown by removing it
 *      inside a transaction and rolling back (Postgres DDL is transactional, so nothing persists);
 *   3. the generic orphan scan finds a row whose parent is gone;
 *   4. the command line wrapper's exit codes and JSON output.
 */

type Result = { id: string; severity: string; count: number; sample: string[] };
type CheckDef = { id: string; sql: string };

let a: TestTenant;
let b: TestTenant;
let client: pg.Client;

beforeAll(async () => {
  a = await createTenant("integrity-x-a");
  b = await createTenant("integrity-x-b");
  client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema");
  if (schema) await client.query(`SET search_path TO "${schema.replace(/"/g, '""')}"`);
});
afterAll(async () => {
  await client?.end();
  await cleanupTenant(a.businessId);
  await cleanupTenant(b.businessId);
  await db.$disconnect();
});

async function check(id: string): Promise<Result> {
  // Run just the one check (a single query) instead of the whole suite: the database is remote.
  const def = ([...CHECKS, ...CONTROL_CHECKS] as { id: string; sql: string }[]).find((c) => c.id === id);
  if (!def) throw new Error(`unknown check ${id}`);
  const { rows } = await client.query(def.sql, def.sql.includes("$1") ? [a.businessId] : []);
  return { id, severity: "", count: rows.length, sample: rows.map((r) => String(r.id)) };
}

describe("tenant and reference rules for the remaining tables", () => {
  it("operator-assignment-tenant", async () => {
    const x = await db.operatorAssignment.create({
      data: { businessId: b.businessId, excavatorId: a.excavatorId, operatorId: a.operatorId, startDate: new Date("2026-10-01") },
    });
    expect((await check("operator-assignment-tenant")).sample).toContain(x.id);
    await db.operatorAssignment.delete({ where: { id: x.id } });
  });

  it("work-request-tenant", async () => {
    const x = await db.operatorWorkRequest.create({
      data: { businessId: b.businessId, excavatorId: a.excavatorId, operatorId: a.operatorId, startDate: new Date(), startHourMeter: 0, endDate: new Date(), endHourMeter: 5, status: "PENDING" },
    });
    expect((await check("work-request-tenant")).sample).toContain(x.id);
    await db.operatorWorkRequest.delete({ where: { id: x.id } });
  });

  it("service-and-expense-tenant", async () => {
    const r = await db.serviceRecord.create({ data: { businessId: b.businessId, excavatorId: a.excavatorId, serviceDate: new Date(), hourMeterAtService: 1 } });
    const e = await db.excavatorExpense.create({ data: { businessId: b.businessId, excavatorId: a.excavatorId, date: new Date(), type: "FUEL", amount: 5 } });
    const flagged = (await check("service-and-expense-tenant")).sample;
    expect(flagged).toContain(r.id);
    expect(flagged).toContain(e.id);
    await db.serviceRecord.delete({ where: { id: r.id } });
    await db.excavatorExpense.delete({ where: { id: e.id } });
  });

  it("machine-current-links-tenant", async () => {
    await db.excavator.update({ where: { id: a.excavatorId }, data: { currentOperatorId: b.operatorId } });
    expect((await check("machine-current-links-tenant")).sample).toContain(a.excavatorId);
    await db.excavator.update({ where: { id: a.excavatorId }, data: { currentOperatorId: null, currentSiteId: b.siteId } });
    expect((await check("machine-current-links-tenant")).sample).toContain(a.excavatorId);
    await db.excavator.update({ where: { id: a.excavatorId }, data: { currentSiteId: null } });
  });

  it("transaction-category-tenant", async () => {
    const cat = await db.transactionCategory.create({ data: { businessId: b.businessId, name: `Cat ${uniq()}` } });
    const tx = await db.operatorTransaction.create({ data: { businessId: a.businessId, operatorId: a.operatorId, categoryId: cat.id, amount: 5, date: new Date() } });
    expect((await check("transaction-category-tenant")).sample).toContain(tx.id);
    await db.operatorTransaction.delete({ where: { id: tx.id } });
    await db.transactionCategory.delete({ where: { id: cat.id } });
  });

  it("join-request-references: a dangling operator or decider id (no foreign key protects these columns)", async () => {
    const j = await db.operatorJoinRequest.create({
      data: { businessId: a.businessId, name: "J", mobile: "9000000009", pinHash: "h", verificationHash: "", status: "PENDING", expiresAt: new Date(Date.now() + 86_400_000), operatorId: "does-not-exist" },
    });
    expect((await check("join-request-references")).sample).toContain(j.id);
    await db.operatorJoinRequest.update({ where: { id: j.id }, data: { operatorId: null, decidedBy: "no-such-user" } });
    expect((await check("join-request-references")).sample).toContain(j.id);
    await db.operatorJoinRequest.delete({ where: { id: j.id } });
  });
});

describe("each control check fails when its control is missing", () => {
  const sqlOf = (id: string) => {
    const found = ([...CHECKS, ...CONTROL_CHECKS] as CheckDef[]).find((c) => c.id === id);
    if (!found) throw new Error(`unknown check ${id}`);
    return found.sql;
  };
  const run = async (id: string) => (await client.query(sqlOf(id), sqlOf(id).includes("$1") ? [a.businessId] : [])).rows.map((r) => r.id as string);
  async function inRolledBackTx(work: () => Promise<void>) {
    await client.query("BEGIN");
    try {
      await work();
    } finally {
      await client.query("ROLLBACK");
    }
  }

  it("control-audit-log-append-only: fails when the triggers are dropped, passes again after rollback", async () => {
    expect(await run("control-audit-log-append-only")).toEqual([]);
    await inRolledBackTx(async () => {
      await client.query('DROP TRIGGER audit_log_no_update_delete ON "AuditLog"');
      await client.query('DROP TRIGGER audit_log_no_truncate ON "AuditLog"');
      expect((await run("control-audit-log-append-only")).sort()).toEqual(["audit_log_no_truncate", "audit_log_no_update_delete"]);
    });
    expect(await run("control-audit-log-append-only")).toEqual([]);
  });

  it("control-audit-log-append-only: also fails when a trigger still exists but has been DISABLED", async () => {
    await inRolledBackTx(async () => {
      await client.query('ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_no_update_delete');
      await client.query('ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_no_truncate');
      expect((await run("control-audit-log-append-only")).sort()).toEqual(["audit_log_no_truncate", "audit_log_no_update_delete"]);
    });
    expect(await run("control-audit-log-append-only")).toEqual([]);
  });

  it("the TRUNCATE trigger really refuses a TRUNCATE of the audit log (rolled back either way)", async () => {
    await client.query("BEGIN");
    try {
      await expect(client.query('TRUNCATE TABLE "AuditLog"')).rejects.toThrow(/append-only/i);
    } finally {
      await client.query("ROLLBACK");
    }
    expect((await client.query('SELECT count(*)::int AS n FROM "AuditLog"')).rows[0].n).toBeGreaterThan(0);
  });

  it("control-check-constraints-present: fails when a CHECK constraint is dropped", async () => {
    await inRolledBackTx(async () => {
      await client.query('ALTER TABLE "Payment" DROP CONSTRAINT "Payment_amount_positive"');
      expect(await run("control-check-constraints-present")).toEqual(["Payment_amount_positive"]);
    });
    expect(await run("control-check-constraints-present")).toEqual([]);
  });

  it("control-bill-item-session-unique: fails when the billed-once unique index is dropped", async () => {
    await inRolledBackTx(async () => {
      await client.query('DROP INDEX "BillItem_workSessionId_key"');
      expect(await run("control-bill-item-session-unique")).toEqual(["BillItem_workSessionId_key"]);
    });
    expect(await run("control-bill-item-session-unique")).toEqual([]);
  });

  it("control-check-constraints-validated: warns while a CHECK constraint is NOT VALID, and is silent once validated", async () => {
    await inRolledBackTx(async () => {
      await client.query('ALTER TABLE "Payment" DROP CONSTRAINT "Payment_amount_positive"');
      await client.query('ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0) NOT VALID');
      expect(await run("control-check-constraints-validated")).toContain("Payment_amount_positive");
      await client.query('ALTER TABLE "Payment" VALIDATE CONSTRAINT "Payment_amount_positive"');
      expect(await run("control-check-constraints-validated")).not.toContain("Payment_amount_positive");
    });
  });

  it("control-foreign-keys-validated: warns about a NOT VALID foreign key", async () => {
    await inRolledBackTx(async () => {
      await client.query('ALTER TABLE "Payment" DROP CONSTRAINT "Payment_billId_fkey"');
      await client.query('ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID');
      expect(await run("control-foreign-keys-validated")).toEqual(["Payment_billId_fkey"]);
    });
  });

  it("bill-paid-within-total: catches paid > total and a non-positive payment once the CHECK constraints are out of the way", async () => {
    const { bill } = ok(await createSummaryBill(a.businessId, a.actor, summaryInput(a)));
    const payment = ok(await addPayment(a.businessId, a.actor, { billId: bill.id, amount: 10, date: "2026-10-03" })).payment;
    expect(await run("bill-paid-within-total")).not.toContain(bill.id);
    await inRolledBackTx(async () => {
      await client.query('ALTER TABLE "Bill" DROP CONSTRAINT "Bill_paid_within_total"');
      await client.query('ALTER TABLE "Payment" DROP CONSTRAINT "Payment_amount_positive"');
      await client.query('UPDATE "Bill" SET "paidAmount" = "totalAmount" + 5 WHERE id = $1', [bill.id]);
      await client.query('UPDATE "Payment" SET "amount" = 0 WHERE id = $1', [payment.id]);
      const flagged = await run("bill-paid-within-total");
      expect(flagged).toContain(bill.id);
      expect(flagged).toContain(payment.id);
    });
    expect(await run("bill-paid-within-total")).not.toContain(bill.id);
  });

  it("no-orphan-foreign-keys: finds a row whose parent is gone (a restore with constraints off)", async () => {
    const { bill } = ok(await createSummaryBill(a.businessId, a.actor, summaryInput(a)));
    const payment = ok(await addPayment(a.businessId, a.actor, { billId: bill.id, amount: 10, date: "2026-10-03" })).payment;
    expect((await orphanCheck(client, 1000)).sample.join("|")).not.toContain(payment.id);
    await inRolledBackTx(async () => {
      // simulate a bad restore: the parent is gone while the foreign key exists but is not validated
      await client.query('ALTER TABLE "Payment" DROP CONSTRAINT "Payment_billId_fkey"');
      await client.query('DELETE FROM "BillItem" WHERE "billId" = $1', [bill.id]);
      await client.query('DELETE FROM "Bill" WHERE id = $1', [bill.id]);
      await client.query('ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID');
      const result = await orphanCheck(client, 1000);
      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(result.sample.join("|")).toContain("Payment.billId -> Bill");
    });
  });
});

describe("the command line wrapper (npm run audit:integrity)", () => {
  const cli = (...args: string[]) => spawnSync(process.execPath, ["scripts/audit-integrity.mjs", ...args], { env: process.env, encoding: "utf8" });

  it("--json for one healthy business: exit 0, machine-readable, no failures, ids only", () => {
    const r = cli("--json", `--business=${b.businessId}`);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.businessId).toBe(b.businessId);
    expect(out.results.every((x: Result) => x.severity !== "error" || x.count === 0)).toBe(true);
    expect(r.stdout).not.toMatch(/Test Customer|Test Owner|@example\.test/); // never names or contact data
  });

  it("exits 1 and names the failing check when the business has a violation, and 0 again once fixed", async () => {
    const { bill } = ok(await createSummaryBill(b.businessId, b.actor, summaryInput(b)));
    await db.bill.update({ where: { id: bill.id }, data: { totalAmount: { increment: 7 } } });
    const bad = cli("--json", `--business=${b.businessId}`);
    expect(bad.status).toBe(1);
    const failing = (JSON.parse(bad.stdout).results as Result[]).filter((x) => x.severity === "error" && x.count > 0).map((x) => x.id);
    expect(failing).toContain("bill-total-formula");

    await db.bill.update({ where: { id: bill.id }, data: { totalAmount: { decrement: 7 } } });
    expect(cli("--json", `--business=${b.businessId}`).status).toBe(0);
  });

  it("the plain-text report marks failures and ends with a count line", async () => {
    const out = cli(`--business=${b.businessId}`).stdout;
    expect(out).toMatch(/\d+ checks: \d+ ok, \d+ warning\(s\), 0 failure\(s\)\./);
    expect(out).toMatch(/^ok {4}bill-total-formula/m);
  });
});
