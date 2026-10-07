import "./pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { sum } from "@/lib/money";
import { addPayment, createSummaryBill, deletePayment, updateBill, updatePayment } from "@/lib/services/bills";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { failed, ok, summaryInput } from "./helpers";

/**
 * Payments: balance maths, status transitions, the "total payments <= bill
 * total" invariant, and what happens when requests race.
 */

let t: TestTenant;

beforeAll(async () => {
  t = await createTenant("payments");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await db.$disconnect();
});

/** A bill whose total is exactly `total` (one line: `total` hours x 1.00). */
async function billOf(total: number) {
  const { bill } = ok(
    await createSummaryBill(
      t.businessId,
      t.actor,
      summaryInput(t, {
        items: [{ excavatorId: t.excavatorId, siteName: "Pay Site", fromDate: "2026-10-01", toDate: "2026-10-01", hours: total, ratePerHour: 1 }],
      }),
    ),
  );
  return bill;
}

const pay = (billId: string, amount: number, extra: { date?: string; method?: string; notes?: string } = {}) =>
  addPayment(t.businessId, t.actor, { billId, amount, date: extra.date ?? "2026-10-03", method: extra.method, notes: extra.notes });

/** The invariant everything below must preserve, read straight from the DB. */
async function expectConsistent(billId: string) {
  const bill = await db.bill.findUniqueOrThrow({ where: { id: billId } });
  const payments = await db.payment.findMany({ where: { billId } });
  const total = sum(payments.map((p) => p.amount));
  expect(bill.paidAmount.toString()).toBe(total.toString());
  expect(bill.paidAmount.lte(bill.totalAmount)).toBe(true);
  const expected = total.isZero() ? "UNPAID" : total.gte(bill.totalAmount) ? "PAID" : "PARTIAL";
  expect(bill.status).toBe(expected);
  return { bill, payments };
}

describe("payment status transitions and balance", () => {
  it("UNPAID -> PARTIAL -> PAID, and back down when a payment is removed", async () => {
    const bill = await billOf(1000);
    expect(bill.status).toBe("UNPAID");

    const p1 = ok(await pay(bill.id, 400.25, { method: "UPI", notes: "first" }));
    expect(p1.bill.status).toBe("PARTIAL");
    expect(p1.bill.paidAmount.toString()).toBe("400.25");
    expect(p1.payment.method).toBe("UPI");

    const p2 = ok(await pay(bill.id, 599.75));
    expect(p2.bill.status).toBe("PAID");
    expect(p2.bill.paidAmount.toString()).toBe("1000");
    await expectConsistent(bill.id);

    const removed = ok(await deletePayment(t.businessId, t.actor, bill.id, p2.payment.id));
    expect(removed.bill.status).toBe("PARTIAL");
    expect(removed.bill.paidAmount.toString()).toBe("400.25");

    const removedAll = ok(await deletePayment(t.businessId, t.actor, bill.id, p1.payment.id));
    expect(removedAll.bill.status).toBe("UNPAID");
    expect(removedAll.bill.paidAmount.toString()).toBe("0");
    await expectConsistent(bill.id);
  });

  it("adds fractional payments exactly (0.1 + 0.2 settles a 0.30 bill)", async () => {
    const bill = await billOf(0.3);
    ok(await pay(bill.id, 0.1));
    const last = ok(await pay(bill.id, 0.2));
    expect(last.bill.status).toBe("PAID");
    expect(last.bill.paidAmount.toString()).toBe("0.3");
    await expectConsistent(bill.id);
  });

  it("accepts a payment of exactly the remaining balance and one paisa less/more is judged exactly", async () => {
    const bill = await billOf(33849.4);
    ok(await pay(bill.id, 33849.39));
    const over = failed(await pay(bill.id, 0.02));
    expect(over.code).toBe("PAYMENT_EXCEEDS_BALANCE");
    expect(over.error).toContain("0.01");
    const last = ok(await pay(bill.id, 0.01));
    expect(last.bill.status).toBe("PAID");
  });

  it("refuses overpayment with PAYMENT_EXCEEDS_BALANCE and records nothing", async () => {
    const bill = await billOf(500);
    ok(await pay(bill.id, 300));
    const f = failed(await pay(bill.id, 200.01));
    expect(f.code).toBe("PAYMENT_EXCEEDS_BALANCE");
    const { payments } = await expectConsistent(bill.id);
    expect(payments).toHaveLength(1);
    // A fully paid bill takes no more money at all.
    ok(await pay(bill.id, 200));
    expect(failed(await pay(bill.id, 0.01)).code).toBe("PAYMENT_EXCEEDS_BALANCE");
  });

  it("refuses a zero or negative amount", async () => {
    const bill = await billOf(100);
    expect(failed(await pay(bill.id, 0)).code).toBe("VALIDATION_FAILED");
    expect(failed(await pay(bill.id, -5)).code).toBe("VALIDATION_FAILED");
    expect(await db.payment.count({ where: { billId: bill.id } })).toBe(0);
  });

  it("each payment bumps the bill version", async () => {
    const bill = await billOf(100);
    const before = (await db.bill.findUniqueOrThrow({ where: { id: bill.id } })).version;
    const r = ok(await pay(bill.id, 10));
    expect(r.bill.version).toBe(before + 1);
    expect(r.payment.version).toBe(0);
  });

  it("the database CHECK constraints are a backstop: a payment above the total cannot be written around the service", async () => {
    const bill = await billOf(100);
    await expect(db.bill.update({ where: { id: bill.id }, data: { paidAmount: 150 } })).rejects.toBeTruthy();
    await expect(
      db.payment.create({ data: { businessId: t.businessId, billId: bill.id, amount: 0, date: new Date() } }),
    ).rejects.toBeTruthy();
  });
});

describe("updatePayment", () => {
  it("keeps the sum within the total and recomputes paidAmount/status", async () => {
    const bill = await billOf(1000);
    const a = ok(await pay(bill.id, 300));
    const b = ok(await pay(bill.id, 300));

    // 300 + 700 = 1000 -> PAID
    const up = ok(
      await updatePayment(t.businessId, t.actor, { billId: bill.id, paymentId: b.payment.id, amount: 700, date: "2026-10-04", method: "Cash", notes: "fix" }),
    );
    expect(up.bill.status).toBe("PAID");
    expect(up.payment.amount.toString()).toBe("700");
    expect(up.payment.version).toBe(1);

    // 300 + 700.01 would exceed the total
    const f = failed(
      await updatePayment(t.businessId, t.actor, { billId: bill.id, paymentId: b.payment.id, amount: 700.01, date: "2026-10-04" }),
    );
    expect(f.code).toBe("PAYMENT_EXCEEDS_BALANCE");

    // lowering a payment reopens the balance
    const down = ok(await updatePayment(t.businessId, t.actor, { billId: bill.id, paymentId: a.payment.id, amount: 100, date: "2026-10-04" }));
    expect(down.bill.status).toBe("PARTIAL");
    expect(down.bill.paidAmount.toString()).toBe("800");
    await expectConsistent(bill.id);
  });

  it("uses optimistic concurrency on the payment (stale expectedVersion -> RESOURCE_MODIFIED)", async () => {
    const bill = await billOf(1000);
    const p = ok(await pay(bill.id, 100));
    ok(await updatePayment(t.businessId, t.actor, { billId: bill.id, paymentId: p.payment.id, amount: 150, date: "2026-10-04", expectedVersion: 0 }));

    const stale = failed(
      await updatePayment(t.businessId, t.actor, { billId: bill.id, paymentId: p.payment.id, amount: 175, date: "2026-10-04", expectedVersion: 0 }),
    );
    expect(stale.code).toBe("RESOURCE_MODIFIED");
    const row = await db.payment.findUniqueOrThrow({ where: { id: p.payment.id } });
    expect(row.amount.toString()).toBe("150");

    const fresh = ok(
      await updatePayment(t.businessId, t.actor, { billId: bill.id, paymentId: p.payment.id, amount: 175, date: "2026-10-04", expectedVersion: 1 }),
    );
    expect(fresh.payment.amount.toString()).toBe("175");

    // deletePayment honours expectedVersion as well
    const staleDelete = failed(await deletePayment(t.businessId, t.actor, bill.id, p.payment.id, { expectedVersion: 0 }));
    expect(staleDelete.code).toBe("RESOURCE_MODIFIED");
    expect(await db.payment.count({ where: { id: p.payment.id } })).toBe(1);
    ok(await deletePayment(t.businessId, t.actor, bill.id, p.payment.id, { expectedVersion: 2 }));
    expect(await db.payment.count({ where: { id: p.payment.id } })).toBe(0);
  });

  it("cannot touch a payment through another bill's id", async () => {
    const billA = await billOf(100);
    const billB = await billOf(100);
    const p = ok(await pay(billA.id, 10));
    expect(failed(await updatePayment(t.businessId, t.actor, { billId: billB.id, paymentId: p.payment.id, amount: 20, date: "2026-10-04" })).code).toBe("NOT_FOUND");
    expect(failed(await deletePayment(t.businessId, t.actor, billB.id, p.payment.id)).code).toBe("NOT_FOUND");
    expect(await db.payment.count({ where: { id: p.payment.id } })).toBe(1);
  });
});

describe("concurrent payments (the double-spend race)", () => {
  it("5 parallel payments of 40% of the total: successes never exceed the total, the rest get PAYMENT_EXCEEDS_BALANCE", async () => {
    const bill = await billOf(1000);
    const results = await Promise.all(Array.from({ length: 5 }, () => pay(bill.id, 400)));

    const successes = results.filter((r) => !("error" in r));
    const failures = results.filter((r) => "error" in r);
    // 400 + 400 = 800 fits, a third 400 would make 1200
    expect(successes).toHaveLength(2);
    expect(failures).toHaveLength(3);
    for (const f of failures) expect(failed(f).code).toBe("PAYMENT_EXCEEDS_BALANCE");

    const { bill: row, payments } = await expectConsistent(bill.id);
    expect(payments).toHaveLength(2);
    expect(row.paidAmount.toString()).toBe("800");
    expect(row.status).toBe("PARTIAL");
  });

  it("parallel payments that exactly fill the bill all succeed, and the next one is refused", async () => {
    const bill = await billOf(1000);
    const results = await Promise.all(Array.from({ length: 5 }, () => pay(bill.id, 200)));
    expect(results.filter((r) => !("error" in r))).toHaveLength(5);
    const { bill: row } = await expectConsistent(bill.id);
    expect(row.status).toBe("PAID");
    expect(failed(await pay(bill.id, 0.01)).code).toBe("PAYMENT_EXCEEDS_BALANCE");
  });

  it("racing updates of two payments cannot push the sum over the total", async () => {
    const bill = await billOf(1000);
    const a = ok(await pay(bill.id, 300));
    const b = ok(await pay(bill.id, 300));
    const results = await Promise.all([
      updatePayment(t.businessId, t.actor, { billId: bill.id, paymentId: a.payment.id, amount: 600, date: "2026-10-04" }),
      updatePayment(t.businessId, t.actor, { billId: bill.id, paymentId: b.payment.id, amount: 600, date: "2026-10-04" }),
    ]);
    expect(results.filter((r) => !("error" in r))).toHaveLength(1);
    expect(failed(results.find((r) => "error" in r)!).code).toBe("PAYMENT_EXCEEDS_BALANCE");
    const { bill: row } = await expectConsistent(bill.id);
    expect(row.paidAmount.toString()).toBe("900");
  });

  it("a payment racing a bill edit never leaves paid > total", async () => {
    const bill = await billOf(1000);
    ok(await pay(bill.id, 200));
    const detail = await db.bill.findUniqueOrThrow({ where: { id: bill.id }, include: { items: true } });
    const item = detail.items[0];
    const results = await Promise.all([
      pay(bill.id, 700),
      updateBill(t.businessId, t.actor, bill.id, {
        customerId: t.customerId,
        billDate: "2026-10-02",
        billNumber: detail.billNumber,
        billType: "NON_GST",
        showCustomerPhone: true,
        transportCharges: 0,
        fuelCharges: 0,
        extraCharges: 0,
        bucketCharge: 0,
        breakerCharge: 0,
        discount: 0,
        bucketHours: 0,
        bucketRate: 0,
        breakerHours: 0,
        breakerRate: 0,
        dieselLiters: 0,
        dieselPricePerLiter: 0,
        items: [
          { id: item.id, excavatorId: t.excavatorId, siteName: "Pay Site", fromDate: "2026-10-01", toDate: "2026-10-01", hours: 500, ratePerHour: 1 },
        ],
      }),
    ]);
    // Whichever order they ran in, at least one is refused or both fit, and the invariant holds.
    const { bill: row } = await expectConsistent(bill.id);
    expect(row.paidAmount.lte(row.totalAmount)).toBe(true);
    const paymentOk = !("error" in results[0]);
    const editOk = !("error" in results[1]);
    // paying 700 on top of 200 needs a total >= 900; the edit sets it to 500: they cannot both succeed
    expect(paymentOk && editOk).toBe(false);
    expect(paymentOk || editOk).toBe(true);
  });
});
