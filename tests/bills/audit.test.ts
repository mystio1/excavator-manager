import "./pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addPayment,
  createBill,
  createDirectBill,
  createSummaryBill,
  deleteBill,
  deletePayment,
  updateBill,
  updatePayment,
} from "@/lib/services/bills";
import { updateBillSchema } from "@/lib/validation/bill";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { billInput, directInput, failed, makeSessions, ok, summaryInput } from "./helpers";

/**
 * Every bill / payment create, update and delete writes an append-only audit
 * row IN THE SAME TRANSACTION, with before/after snapshots. A change that is
 * refused writes no audit row.
 */

let t: TestTenant;

beforeAll(async () => {
  t = await createTenant("bill-audit");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await db.$disconnect();
});

const auditFor = (entityId: string, action?: string) =>
  db.auditLog.findMany({ where: { businessId: t.businessId, entityId, ...(action ? { action } : {}) }, orderBy: { createdAt: "asc" } });

/** JSON snapshot as the trail stores it: Decimals as exact strings. */
type Snapshot = Record<string, unknown> & { items?: Record<string, unknown>[]; payments?: Record<string, unknown>[] };
const snap = (value: unknown) => value as Snapshot;

function expectActor(row: { actorType: string | null; actorId: string | null; userId: string | null; userName: string | null }) {
  expect(row.actorType).toBe("OWNER");
  expect(row.actorId).toBe(t.userId);
  expect(row.userId).toBe(t.userId);
  expect(row.userName).toBe("Test Owner");
}

describe("bill audit trail", () => {
  it("bill.create (work sessions): one row, no before, full after snapshot with items", async () => {
    const sessions = await makeSessions(t, [8, 4]);
    const { bill } = ok(await createBill(t.businessId, t.actor, billInput(t, sessions.map((s) => s.id), { ratePerHour: 1000.5 })));

    const rows = await auditFor(bill.id);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({ action: "bill.create", entityType: "Bill", entityId: bill.id });
    expectActor(row);
    expect(row.before).toBeNull();
    const after = snap(row.after);
    expect(after.id).toBe(bill.id);
    expect(after.totalAmount).toBe("12006"); // exact string, not a float
    expect(after.items).toHaveLength(2);
    expect(after.items![0]).toHaveProperty("workSessionId");
    expect(after).not.toHaveProperty("letterhead"); // large frozen block is left out
    expect(row.details).toMatchObject({ billNumber: bill.billNumber, source: "work-sessions" });
  });

  it("bill.create for summary and direct bills", async () => {
    const summary = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
    const direct = ok(await createDirectBill(t.businessId, t.actor, directInput(t)));
    const [sRow] = await auditFor(summary.bill.id, "bill.create");
    const [dRow] = await auditFor(direct.bill.id, "bill.create");
    expect(sRow.details).toMatchObject({ source: "summary" });
    expect(snap(sRow.after).items).toHaveLength(1);
    expect(dRow.details).toMatchObject({ source: "direct" });
    expect(snap(dRow.after).isDirect).toBe(true);
    expectActor(sRow);
    expectActor(dRow);
  });

  it("bill.update: before and after snapshots (with items), the reason, and the new version", async () => {
    const { bill } = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t))); // 10000
    const items = await db.billItem.findMany({ where: { billId: bill.id } });
    const input = updateBillSchema.parse({
      customerId: t.customerId,
      billDate: "2026-10-05",
      billNumber: bill.billNumber,
      billType: "NON_GST",
      reason: "Customer renegotiated the rate",
      items: [{ id: items[0].id, excavatorId: t.excavatorId, siteName: "Summary Site", fromDate: "2026-10-01", toDate: "2026-10-01", hours: 10, ratePerHour: 1250.5 }],
    });
    ok(await updateBill(t.businessId, t.actor, bill.id, input));

    const [row] = await auditFor(bill.id, "bill.update");
    expect(row).toMatchObject({ entityType: "Bill", reason: "Customer renegotiated the rate" });
    expectActor(row);
    const before = snap(row.before);
    const after = snap(row.after);
    expect(before.totalAmount).toBe("10000");
    expect(after.totalAmount).toBe("12505");
    expect(before.version).toBe(0);
    expect(after.version).toBe(1);
    expect(before.items).toHaveLength(1);
    expect(after.items).toHaveLength(1);
    expect(before.items![0].ratePerHour).toBe("1000");
    expect(after.items![0].ratePerHour).toBe("1250.5");
  });

  it("bill.delete: the whole bill, its lines and its payments are kept as `before`", async () => {
    const { bill } = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
    ok(await addPayment(t.businessId, t.actor, { billId: bill.id, amount: 1500.25, date: "2026-10-03", method: "UPI" }));
    ok(await addPayment(t.businessId, t.actor, { billId: bill.id, amount: 100, date: "2026-10-04" }));
    ok(await deleteBill(t.businessId, t.actor, bill.id, { reason: "Entered by mistake" }));

    const [row] = await auditFor(bill.id, "bill.delete");
    expect(row).toMatchObject({ entityType: "Bill", reason: "Entered by mistake" });
    expectActor(row);
    expect(row.after).toBeNull();
    const before = snap(row.before);
    expect(before.totalAmount).toBe("10000");
    expect(before.paidAmount).toBe("1600.25");
    expect(before.items).toHaveLength(1);
    expect(before.payments).toHaveLength(2);
    expect(before.payments!.map((p) => p.amount).sort()).toEqual(["100", "1500.25"]);
    // The audit row outlives the bill it describes.
    expect(await db.bill.count({ where: { id: bill.id } })).toBe(0);
  });
});

describe("payment audit trail", () => {
  it("payment.create / payment.update / payment.delete each write a row with before/after", async () => {
    const { bill } = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t))); // 10000
    const added = ok(await addPayment(t.businessId, t.actor, { billId: bill.id, amount: 400, date: "2026-10-03", method: "Cash" }));
    const paymentId = added.payment.id;
    ok(
      await updatePayment(t.businessId, t.actor, {
        billId: bill.id,
        paymentId,
        amount: 450.5,
        date: "2026-10-04",
        method: "UPI",
        reason: "Typo in amount",
      }),
    );
    ok(await deletePayment(t.businessId, t.actor, bill.id, paymentId, { reason: "Bounced" }));

    const rows = await auditFor(paymentId);
    expect(rows.map((r) => r.action)).toEqual(["payment.create", "payment.update", "payment.delete"]);
    for (const r of rows) {
      expect(r.entityType).toBe("Payment");
      expectActor(r);
    }
    const [created, updated, deleted] = rows;

    expect(created.before).toBeNull();
    expect(snap(created.after)).toMatchObject({ id: paymentId, amount: "400", method: "Cash", billId: bill.id });
    expect(created.details).toMatchObject({ billId: bill.id, billNumber: bill.billNumber, status: "PARTIAL" });

    expect(snap(updated.before)).toMatchObject({ amount: "400", method: "Cash" });
    expect(snap(updated.after)).toMatchObject({ amount: "450.5", method: "UPI" });
    expect(updated.reason).toBe("Typo in amount");

    expect(snap(deleted.before)).toMatchObject({ id: paymentId, amount: "450.5" });
    expect(deleted.after).toBeNull();
    expect(deleted.reason).toBe("Bounced");
    expect(deleted.details).toMatchObject({ status: "UNPAID" });
  });
});

describe("refused changes leave no audit trail", () => {
  it("a failed double billing, overpayment, stale edit and below-paid edit write nothing", async () => {
    const sessions = await makeSessions(t, [8]);
    const { bill } = ok(await createBill(t.businessId, t.actor, billInput(t, [sessions[0].id], { ratePerHour: 1000 }))); // 8000
    ok(await addPayment(t.businessId, t.actor, { billId: bill.id, amount: 5000, date: "2026-10-03" }));
    const items = await db.billItem.findMany({ where: { billId: bill.id } });

    const totalAudit = () => db.auditLog.count({ where: { businessId: t.businessId } });
    const before = await totalAudit();

    expect(failed(await createBill(t.businessId, t.actor, billInput(t, [sessions[0].id]))).code).toBe("WORK_SESSION_ALREADY_BILLED");
    expect(failed(await addPayment(t.businessId, t.actor, { billId: bill.id, amount: 3000.01, date: "2026-10-03" })).code).toBe("PAYMENT_EXCEEDS_BALANCE");

    const edit = (hours: number, expectedVersion?: number) =>
      updateBillSchema.parse({
        customerId: t.customerId,
        billDate: "2026-10-05",
        billNumber: bill.billNumber,
        billType: "NON_GST",
        ...(expectedVersion === undefined ? {} : { expectedVersion }),
        items: [{ id: items[0].id, excavatorId: t.excavatorId, siteName: "S", fromDate: "2026-10-01", toDate: "2026-10-01", hours, ratePerHour: 1000 }],
      });
    expect(failed(await updateBill(t.businessId, t.actor, bill.id, edit(9, 0))).code).toBe("RESOURCE_MODIFIED"); // version is 1 after the payment
    expect(failed(await updateBill(t.businessId, t.actor, bill.id, edit(4))).code).toBe("BILL_TOTAL_BELOW_PAID");
    expect(failed(await deleteBill(t.businessId, t.actor, bill.id, { expectedVersion: 0 })).code).toBe("RESOURCE_MODIFIED");

    expect(await totalAudit()).toBe(before);
  });

  it("the audit row is part of the transaction: it commits or rolls back with the change", async () => {
    const { bill } = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
    // A caller transaction that rolls back after the service succeeded takes the audit row with it.
    class Abort extends Error {}
    await expect(
      db.$transaction(async (tx) => {
        ok(await addPayment(t.businessId, t.actor, { billId: bill.id, amount: 10, date: "2026-10-03" }, { tx }));
        throw new Abort("roll back");
      }),
    ).rejects.toBeInstanceOf(Abort);
    expect(await db.payment.count({ where: { billId: bill.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { businessId: t.businessId, action: "payment.create", details: { path: ["billId"], equals: bill.id } } })).toBe(0);
  });
});
