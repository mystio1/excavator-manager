import "./pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { db } from "@/lib/db";
import {
  addPayment,
  createBill,
  createDirectBill,
  createSummaryBill,
  deleteBill,
  updateBill,
} from "@/lib/services/bills";
import { updateBillSchema } from "@/lib/validation/bill";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { billInput, directInput, failed, makeSessions, ok, summaryInput, uniq } from "./helpers";

/**
 * Editing and deleting bills: totals are recomputed exactly, payments already
 * recorded are never orphaned (BILL_TOTAL_BELOW_PAID), stale edits are refused
 * (RESOURCE_MODIFIED) and a failed edit changes nothing.
 */

let t: TestTenant;

beforeAll(async () => {
  t = await createTenant("bill-update");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await db.$disconnect();
});

type RawUpdate = Partial<z.input<typeof updateBillSchema>>;

type LineSpec = { id?: string; hours: number; rate: number; site?: string };
const line = ({ id, hours, rate, site }: LineSpec, t0: TestTenant) => ({
  ...(id ? { id } : {}),
  excavatorId: t0.excavatorId,
  siteName: site ?? "Edited Site",
  fromDate: "2026-10-01",
  toDate: "2026-10-01",
  hours,
  ratePerHour: rate,
});

function updateInput(billNumber: string, lines: LineSpec[], over: RawUpdate = {}) {
  return updateBillSchema.parse({
    customerId: t.customerId,
    billDate: "2026-10-05",
    billNumber,
    billType: "NON_GST",
    items: lines.map((l) => line(l, t)),
    ...over,
  });
}

/** A bill of two work-session lines (8 h and 4 h) at rate 1000 -> total 12000. */
async function sessionBill() {
  const sessions = await makeSessions(t, [8, 4]);
  const { bill } = ok(await createBill(t.businessId, t.actor, billInput(t, sessions.map((s) => s.id), { ratePerHour: 1000 })));
  const items = await db.billItem.findMany({ where: { billId: bill.id } });
  return { bill, sessions, items };
}

const fresh = (id: string) => db.bill.findUniqueOrThrow({ where: { id }, include: { items: true, payments: true } });
const s = (value: { toString(): string } | null) => (value === null ? null : value.toString());

describe("updateBill", () => {
  it("recomputes totals exactly, keeps the work link of edited lines and frees removed lines", async () => {
    const { bill, sessions, items } = await sessionBill();
    const keep = items.find((i) => i.workSessionId === sessions[0].id)!;

    const result = ok(
      await updateBill(
        t.businessId,
        t.actor,
        bill.id,
        // line 1 edited in place: 8.5 h x 1200.50 = 10204.25 ; line 2 removed ; a typed row 2 h x 99.99 = 199.98
        updateInput(bill.billNumber, [{ id: keep.id, hours: 8.5, rate: 1200.5 }, { hours: 2, rate: 99.99 }], { transportCharges: 10.1 }),
      ),
    );
    expect(result.id).toBe(bill.id);
    expect(result.version).toBe(1);

    const row = await fresh(bill.id);
    expect(s(row.subtotal)).toBe("10404.23");
    expect(s(row.totalAmount)).toBe("10414.33");
    expect(row.billDate.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(row.items).toHaveLength(2);
    const linked = row.items.find((i) => i.workSessionId !== null)!;
    expect(linked.workSessionId).toBe(sessions[0].id);
    expect(s(linked.amount)).toBe("10204.25");
    expect(row.items.find((i) => i.workSessionId === null && i.siteName === "Edited Site")).toBeTruthy();

    // The removed line's work is billable again; the kept one still is not.
    const rebill = ok(await createBill(t.businessId, t.actor, billInput(t, [sessions[1].id])));
    expect(rebill.bill.id).not.toBe(bill.id);
    expect(failed(await createBill(t.businessId, t.actor, billInput(t, [sessions[0].id]))).code).toBe("WORK_SESSION_ALREADY_BILLED");
  });

  it("switching a bill to GST recomputes cgst/sgst to the paisa", async () => {
    const { bill, items } = await sessionBill();
    ok(
      await updateBill(
        t.businessId,
        t.actor,
        bill.id,
        // 18.8 h x 1800.50 = 33849.40 -> 18%: cgst 3046.45, sgst 3046.44, total 39942.29
        updateInput(bill.billNumber, [{ id: items[0].id, hours: 18.8, rate: 1800.5 }], { billType: "GST", gstPercentage: 18 }),
      ),
    );
    const row = await fresh(bill.id);
    expect(s(row.cgst)).toBe("3046.45");
    expect(s(row.sgst)).toBe("3046.44");
    expect(s(row.totalAmount)).toBe("39942.29");
    expect(s(row.gstPercentage)).toBe("18");
  });

  it("refuses to drop the total below what has been paid (BILL_TOTAL_BELOW_PAID) and changes nothing", async () => {
    const { bill, items } = await sessionBill(); // total 12000
    ok(await addPayment(t.businessId, t.actor, { billId: bill.id, amount: 7000, date: "2026-10-03" }));
    const before = await fresh(bill.id);

    const f = failed(
      await updateBill(t.businessId, t.actor, bill.id, updateInput(bill.billNumber, [{ id: items[0].id, hours: 6.99, rate: 1000 }])),
    );
    expect(f.code).toBe("BILL_TOTAL_BELOW_PAID");
    expect(f.error).toContain("7000.00");

    const after = await fresh(bill.id);
    expect(after.version).toBe(before.version);
    expect(s(after.totalAmount)).toBe(s(before.totalAmount));
    expect(after.items.map((i) => i.id).sort()).toEqual(before.items.map((i) => i.id).sort());
    expect(after.items.map((i) => s(i.amount)).sort()).toEqual(before.items.map((i) => s(i.amount)).sort());
  });

  it("re-derives the payment status against the new total (PARTIAL -> PAID at exactly the paid amount)", async () => {
    const { bill, items } = await sessionBill(); // 12000
    ok(await addPayment(t.businessId, t.actor, { billId: bill.id, amount: 7000, date: "2026-10-03" }));

    ok(await updateBill(t.businessId, t.actor, bill.id, updateInput(bill.billNumber, [{ id: items[0].id, hours: 7.5, rate: 1000 }]))); // 7500
    expect((await fresh(bill.id)).status).toBe("PARTIAL");

    ok(await updateBill(t.businessId, t.actor, bill.id, updateInput(bill.billNumber, [{ id: items[0].id, hours: 7, rate: 1000 }]))); // 7000
    const row = await fresh(bill.id);
    expect(row.status).toBe("PAID");
    expect(s(row.paidAmount)).toBe("7000");
  });

  it("heals the cached paidAmount from the payment rows", async () => {
    const { bill, items } = await sessionBill();
    ok(await addPayment(t.businessId, t.actor, { billId: bill.id, amount: 1000, date: "2026-10-03" }));
    // Simulate drift of the cached column (the CHECK allows 0..total).
    await db.bill.update({ where: { id: bill.id }, data: { paidAmount: 5 } });
    ok(await updateBill(t.businessId, t.actor, bill.id, updateInput(bill.billNumber, [{ id: items[0].id, hours: 13, rate: 1000 }])));
    expect(s((await fresh(bill.id)).paidAmount)).toBe("1000");
  });

  it("optimistic concurrency: a stale expectedVersion is refused with RESOURCE_MODIFIED, the current one is accepted", async () => {
    const { bill, items } = await sessionBill();
    const input = (hours: number, expectedVersion?: number) =>
      updateInput(bill.billNumber, [{ id: items[0].id, hours, rate: 1000 }], expectedVersion === undefined ? {} : { expectedVersion });

    ok(await updateBill(t.businessId, t.actor, bill.id, input(9, 0))); // version 0 -> 1
    const stale = failed(await updateBill(t.businessId, t.actor, bill.id, input(10, 0)));
    expect(stale.code).toBe("RESOURCE_MODIFIED");
    expect(s((await fresh(bill.id)).subtotal)).toBe("9000");

    ok(await updateBill(t.businessId, t.actor, bill.id, input(10, 1))); // version 1 -> 2
    // Omitted expectedVersion (older installed apps) skips the check.
    const legacy = ok(await updateBill(t.businessId, t.actor, bill.id, input(11)));
    expect(legacy.version).toBe(3);
  });

  it("a payment recorded after the form was opened makes the edit stale", async () => {
    const { bill, items } = await sessionBill();
    const loaded = (await fresh(bill.id)).version;
    ok(await addPayment(t.businessId, t.actor, { billId: bill.id, amount: 100, date: "2026-10-03" }));
    const f = failed(
      await updateBill(
        t.businessId,
        t.actor,
        bill.id,
        updateInput(bill.billNumber, [{ id: items[0].id, hours: 9, rate: 1000 }], { expectedVersion: loaded }),
      ),
    );
    expect(f.code).toBe("RESOURCE_MODIFIED");
  });

  it("rejects a bill number another bill already uses (BILL_NUMBER_TAKEN)", async () => {
    const { bill, items } = await sessionBill();
    const other = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t, { billNumber: `TAKEN-${uniq()}` })));
    const f = failed(
      await updateBill(t.businessId, t.actor, bill.id, updateInput(other.bill.billNumber, [{ id: items[0].id, hours: 1, rate: 1 }])),
    );
    expect(f.code).toBe("BILL_NUMBER_TAKEN");
    // Keeping its own number is fine.
    ok(await updateBill(t.businessId, t.actor, bill.id, updateInput(bill.billNumber, [{ id: items[0].id, hours: 1, rate: 1 }])));
  });

  it("needs at least one row, and only machines of this business", async () => {
    const { bill } = await sessionBill();
    const noRows = failed(await updateBill(t.businessId, t.actor, bill.id, updateInput(bill.billNumber, [], { items: [] })));
    expect(noRows.code).toBe("VALIDATION_FAILED");

    const other = await createTenant("bill-update-other");
    try {
      const foreign = failed(
        await updateBill(t.businessId, t.actor, bill.id, {
          ...updateInput(bill.billNumber, [{ hours: 1, rate: 1 }]),
          items: [{ ...line({ hours: 1, rate: 1 }, other) }],
        }),
      );
      expect(foreign.code).toBe("NOT_FOUND");
      const foreignCustomer = failed(
        await updateBill(t.businessId, t.actor, bill.id, updateInput(bill.billNumber, [{ hours: 1, rate: 1 }], { customerId: other.customerId })),
      );
      expect(foreignCustomer.code).toBe("NOT_FOUND");
    } finally {
      await cleanupTenant(other.businessId);
    }
  });

  it("edits a direct bill from its direct-bill fields with exact amounts", async () => {
    const { bill } = ok(await createDirectBill(t.businessId, t.actor, directInput(t, { bucketHours: 10, bucketRate: 1000 })));
    const result = ok(
      await updateBill(
        t.businessId,
        t.actor,
        bill.id,
        // bucket 5.5 x 1200.25 = 6601.38 ; breaker 2 x 900 = 1800 ; transport 250 ; diesel 20 x 91.35 = 1827 ; 18% GST
        updateBillSchema.parse({
          customerId: t.customerId,
          billDate: "2026-10-05",
          billNumber: bill.billNumber,
          billType: "GST",
          gstPercentage: 18,
          excavatorId: t.excavatorId,
          fromDate: "2026-10-01",
          toDate: "2026-10-02",
          bucketHours: 5.5,
          bucketRate: 1200.25,
          breakerHours: 2,
          breakerRate: 900,
          transportCharges: 250,
          dieselLiters: 20,
          dieselPricePerLiter: 91.35,
        }),
      ),
    );
    expect(result.version).toBe(1);
    const row = await fresh(bill.id);
    expect(s(row.subtotal)).toBe("8401.38");
    expect(s(row.cgst)).toBe("778.63");
    expect(s(row.sgst)).toBe("778.62");
    expect(s(row.dieselAdvance)).toBe("1827");
    expect(s(row.totalAmount)).toBe("8381.63");
    expect(row.items).toHaveLength(0);
  });

  it("a direct bill edit needs its machine and period, and cannot go below what is paid", async () => {
    const { bill } = ok(await createDirectBill(t.businessId, t.actor, directInput(t, { bucketHours: 10, bucketRate: 1000 }))); // 10000
    ok(await addPayment(t.businessId, t.actor, { billId: bill.id, amount: 6000, date: "2026-10-03" }));
    const base = {
      customerId: t.customerId,
      billDate: "2026-10-05",
      billNumber: bill.billNumber,
      billType: "NON_GST" as const,
      excavatorId: t.excavatorId,
      fromDate: "2026-10-01",
      toDate: "2026-10-02",
      bucketHours: 10,
      bucketRate: 1000,
    };
    const noMachine = failed(await updateBill(t.businessId, t.actor, bill.id, updateBillSchema.parse({ ...base, excavatorId: undefined })));
    expect(noMachine.code).toBe("VALIDATION_FAILED");
    const below = failed(await updateBill(t.businessId, t.actor, bill.id, updateBillSchema.parse({ ...base, bucketHours: 5.99 })));
    expect(below.code).toBe("BILL_TOTAL_BELOW_PAID");
    const exact = ok(await updateBill(t.businessId, t.actor, bill.id, updateBillSchema.parse({ ...base, bucketHours: 6 })));
    expect(exact.version).toBe(2); // addPayment bumped it to 1
    expect((await fresh(bill.id)).status).toBe("PAID");
  });
});

describe("deleteBill", () => {
  it("removes the bill with its lines and payments", async () => {
    const { bill } = await sessionBill();
    ok(await addPayment(t.businessId, t.actor, { billId: bill.id, amount: 100, date: "2026-10-03" }));
    ok(await deleteBill(t.businessId, t.actor, bill.id));
    expect(await db.bill.count({ where: { id: bill.id } })).toBe(0);
    expect(await db.billItem.count({ where: { billId: bill.id } })).toBe(0);
    expect(await db.payment.count({ where: { billId: bill.id } })).toBe(0);
  });

  it("is refused with RESOURCE_MODIFIED when the bill changed since it was loaded", async () => {
    const { bill } = await sessionBill();
    const loaded = (await fresh(bill.id)).version;
    ok(await addPayment(t.businessId, t.actor, { billId: bill.id, amount: 100, date: "2026-10-03" }));
    const f = failed(await deleteBill(t.businessId, t.actor, bill.id, { expectedVersion: loaded }));
    expect(f.code).toBe("RESOURCE_MODIFIED");
    expect(await db.bill.count({ where: { id: bill.id } })).toBe(1);

    ok(await deleteBill(t.businessId, t.actor, bill.id, { expectedVersion: loaded + 1 }));
    expect(await db.bill.count({ where: { id: bill.id } })).toBe(0);
  });

  it("returns NOT_FOUND for a bill that does not exist", async () => {
    expect(failed(await deleteBill(t.businessId, t.actor, "does-not-exist")).code).toBe("NOT_FOUND");
    expect(failed(await updateBill(t.businessId, t.actor, "does-not-exist", updateInput("X", [{ hours: 1, rate: 1 }]))).code).toBe("NOT_FOUND");
  });
});
