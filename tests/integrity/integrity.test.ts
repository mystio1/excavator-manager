import "../bills/pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { db } from "@/lib/db";
import { addPayment, createBill, createDirectBill, createSummaryBill } from "@/lib/services/bills";
import { cleanupTenant, createCompletedSession, createTenant, type TestTenant } from "../helpers/tenant";
import { billInput, directInput, ok, summaryInput, uniq } from "../bills/helpers";
// Plain ESM shared with scripts/audit-integrity.mjs (`npm run audit:integrity`).
import { CHECKS, CONTROL_CHECKS, runChecks } from "../../scripts/lib/integrity-checks.mjs";

/**
 * Proves the integrity checker (docs/invariants.md) is not decorative: a healthy
 * tenant passes every check, and for each invariant a targeted corruption of one
 * row is detected — and only that row. The corruptions are plain UPDATEs; the
 * database CHECK constraints correctly refuse the ones they cover (negative
 * payments, paid > total), which is why those are not in this list.
 */

type Result = { id: string; severity: string; count: number; sample: string[] };

let a: TestTenant;
let b: TestTenant;
let client: pg.Client;

beforeAll(async () => {
  a = await createTenant("integrity-a");
  b = await createTenant("integrity-b");
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

async function normalBill(over: Parameters<typeof billInput>[2] = {}) {
  const s = await createCompletedSession(a, { totalHours: 8 });
  return { s, ...ok(await createBill(a.businessId, a.actor, billInput(a, [s.id], { billNumber: `INT-${uniq()}`, ...over }))) };
}

async function summaryBill(over: Parameters<typeof summaryInput>[1] = {}) {
  return ok(await createSummaryBill(a.businessId, a.actor, summaryInput(a, over))).bill;
}

describe("a healthy tenant", () => {
  it("passes every invariant (normal, GST, summary and direct bills, with a part payment)", async () => {
    const gst = await normalBill({ billType: "GST", gstPercentage: 18, billNumber: `GST-${uniq()}`, transportCharges: 500, discount: 200 });
    await summaryBill();
    const direct = ok(await createDirectBill(a.businessId, a.actor, directInput(a, { transportCharges: 300, dieselLiters: 5, dieselPricePerLiter: 90 }))).bill;
    ok(await addPayment(a.businessId, a.actor, { billId: gst.bill.id, amount: 1234.56, date: "2026-10-03" }));
    ok(await addPayment(a.businessId, a.actor, { billId: direct.id, amount: 50, date: "2026-10-03" }));

    const results = (await runChecks(client, { businessId: a.businessId })) as Result[];
    const violated = results.filter((r) => r.count > 0 && r.severity === "error");
    expect(violated).toEqual([]);
    // Scoped data checks have no warnings either; the only acceptable warning is the
    // global "constraints not validated yet" control note.
    const warned = results.filter((r) => r.count > 0 && r.severity === "warn").map((r) => r.id);
    expect(warned.filter((id) => id !== "control-check-constraints-validated")).toEqual([]);
  });

  it("the database-level controls are in place", async () => {
    for (const id of ["control-audit-log-append-only", "control-check-constraints-present", "control-bill-item-session-unique"]) {
      expect((await check(id)).count, id).toBe(0);
    }
  });
});

describe("each invariant detects its own corruption", () => {
  it("bill-paid-equals-payments", async () => {
    const bill = await summaryBill();
    ok(await addPayment(a.businessId, a.actor, { billId: bill.id, amount: 100, date: "2026-10-03" }));
    await db.bill.update({ where: { id: bill.id }, data: { paidAmount: 40 } });
    expect((await check("bill-paid-equals-payments")).sample).toContain(bill.id);
  });

  it("bill-status-matches-amounts", async () => {
    const bill = await summaryBill();
    await db.bill.update({ where: { id: bill.id }, data: { status: "PAID" } });
    expect((await check("bill-status-matches-amounts")).sample).toContain(bill.id);
  });

  it("bill-subtotal-equals-items", async () => {
    const bill = await summaryBill();
    await db.bill.update({ where: { id: bill.id }, data: { subtotal: { increment: 1 } } });
    expect((await check("bill-subtotal-equals-items")).sample).toContain(bill.id);
  });

  it("bill-item-amount", async () => {
    const bill = await summaryBill();
    const item = await db.billItem.findFirstOrThrow({ where: { billId: bill.id } });
    await db.billItem.update({ where: { id: item.id }, data: { amount: { increment: 1 } } });
    expect((await check("bill-item-amount")).sample).toContain(item.id);
  });

  it("bill-total-formula", async () => {
    const bill = await summaryBill();
    await db.bill.update({ where: { id: bill.id }, data: { totalAmount: { increment: 5 } } });
    expect((await check("bill-total-formula")).sample).toContain(bill.id);
  });

  it("direct-bill-subtotal", async () => {
    const bill = ok(await createDirectBill(a.businessId, a.actor, directInput(a))).bill;
    await db.bill.update({ where: { id: bill.id }, data: { subtotal: { increment: 1 } } });
    expect((await check("direct-bill-subtotal")).sample).toContain(bill.id);
  });

  it("bill-gst-amount", async () => {
    const { bill } = await normalBill({ billType: "GST", gstPercentage: 18, billNumber: `GST-${uniq()}` });
    await db.bill.update({ where: { id: bill.id }, data: { cgst: { increment: 1 } } });
    expect((await check("bill-gst-amount")).sample).toContain(bill.id);
  });

  it("payment-tenant", async () => {
    const bill = await summaryBill();
    const payment = ok(await addPayment(a.businessId, a.actor, { billId: bill.id, amount: 10, date: "2026-10-03" })).payment;
    await db.payment.update({ where: { id: payment.id }, data: { businessId: b.businessId } });
    expect((await check("payment-tenant")).sample).toContain(payment.id);
  });

  it("bill-parents-tenant", async () => {
    const bill = await summaryBill();
    await db.bill.update({ where: { id: bill.id }, data: { customerId: b.customerId } });
    expect((await check("bill-parents-tenant")).sample).toContain(bill.id);
  });

  it("bill-item-tenant", async () => {
    const bill = await summaryBill();
    const item = await db.billItem.findFirstOrThrow({ where: { billId: bill.id } });
    await db.billItem.update({ where: { id: item.id }, data: { excavatorId: b.excavatorId } });
    expect((await check("bill-item-tenant")).sample).toContain(item.id);
  });

  it("work-session-tenant", async () => {
    const s = await createCompletedSession(a);
    await db.workSession.update({ where: { id: s.id }, data: { customerId: b.customerId } });
    expect((await check("work-session-tenant")).sample).toContain(s.id);
  });

  it("operator-transaction-tenant", async () => {
    const tx = await db.operatorTransaction.create({
      data: { businessId: b.businessId, operatorId: a.operatorId, amount: 10, date: new Date("2026-10-01") },
    });
    expect((await check("operator-transaction-tenant")).sample).toContain(tx.id);
    await db.operatorTransaction.delete({ where: { id: tx.id } }); // would block cleanup (Restrict FK)
  });

  it("billed-session-completed", async () => {
    const { s } = await normalBill();
    await db.workSession.update({ where: { id: s.id }, data: { status: "PENDING" } });
    expect((await check("billed-session-completed")).sample).toContain(s.id);
  });

  it("one-active-session-per-machine", async () => {
    const machine = await db.excavator.create({ data: { businessId: a.businessId, name: "Active twice", machineNumber: `TST-${uniq()}` } });
    const make = () =>
      db.workSession.create({
        data: {
          businessId: a.businessId,
          excavatorId: machine.id,
          customerId: a.customerId,
          siteId: a.siteId,
          operatorId: a.operatorId,
          startDate: new Date("2026-10-01"),
          startHourMeter: 10,
          status: "ACTIVE",
        },
      });
    const [s1, s2] = [await make(), await make()];
    const flagged = (await check("one-active-session-per-machine")).sample;
    expect(flagged).toContain(s1.id);
    expect(flagged).toContain(s2.id);
  });

  it("completed-session-shape", async () => {
    const s = await createCompletedSession(a);
    await db.workSession.update({ where: { id: s.id }, data: { endDate: null } });
    expect((await check("completed-session-shape")).sample).toContain(s.id);
  });

  it("a clean bill is never flagged by the arithmetic checks", async () => {
    const clean = await summaryBill();
    for (const id of ["bill-paid-equals-payments", "bill-status-matches-amounts", "bill-subtotal-equals-items", "bill-total-formula", "bill-gst-amount"]) {
      expect((await check(id)).sample, id).not.toContain(clean.id);
    }
  });
});
