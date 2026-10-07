import "./pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createBill, createDirectBill, createSummaryBill, previewNextNonGstBillNumber } from "@/lib/services/bills";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { billInput, directInput, failed, makeSessions, ok, summaryInput, uniq } from "./helpers";

/**
 * Exact bill arithmetic against the real database: every figure below is
 * worked out by hand in decimal (no float ever involved) and compared as the
 * exact NUMERIC string the database stores.
 */

let t: TestTenant;

beforeAll(async () => {
  t = await createTenant("bill-totals");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await db.$disconnect();
});

const fresh = (id: string) => db.bill.findUniqueOrThrow({ where: { id }, include: { items: true } });
const s = (value: { toString(): string } | null) => (value === null ? null : value.toString());

describe("createBill - exact totals", () => {
  it("sums per-line amounts and charges exactly (hours x rate rounded per line)", async () => {
    // 8 x 1800.50 = 14404.00 ; 4.5 x 1800.50 = 8102.25 ; 18.8 x 1800.50 = 33849.40
    const sessions = await makeSessions(t, [8, 4.5, 18.8]);
    const { bill } = ok(
      await createBill(
        t.businessId,
        t.actor,
        billInput(t, sessions.map((x) => x.id), {
          ratePerHour: 1800.5,
          transportCharges: 100.1,
          fuelCharges: 50.05,
          discount: 10.15,
        }),
      ),
    );
    const row = await fresh(bill.id);
    expect(s(row.subtotal)).toBe("56355.65");
    // taxable = 56355.65 + 100.10 + 50.05 - 10.15 = 56495.65 (NON_GST: no tax)
    expect(s(row.totalAmount)).toBe("56495.65");
    expect(row.cgst).toBeNull();
    expect(row.sgst).toBeNull();
    expect(row.gstPercentage).toBeNull();
    expect(s(row.paidAmount)).toBe("0");
    expect(row.status).toBe("UNPAID");

    const amounts = row.items.map((i) => s(i.amount)).sort();
    expect(amounts).toEqual(["14404", "33849.4", "8102.25"]);
    for (const item of row.items) expect(s(item.ratePerHour)).toBe("1800.5");
  });

  it("bills 18.8 h x 1800.50 as exactly 33849.40 and splits 18% GST to the paisa", async () => {
    const [session] = await makeSessions(t, [18.8]);
    const { bill } = ok(
      await createBill(
        t.businessId,
        t.actor,
        billInput(t, [session.id], {
          ratePerHour: 1800.5,
          billType: "GST",
          gstPercentage: 18,
          billNumber: `GST-${uniq()}`,
        }),
      ),
    );
    const row = await fresh(bill.id);
    expect(s(row.items[0].amount)).toBe("33849.4");
    expect(s(row.subtotal)).toBe("33849.4");
    // tax = 33849.40 x 18% = 6092.892 -> 6092.89 ; cgst = 3046.445 -> 3046.45 ; sgst = 3046.44
    expect(s(row.cgst)).toBe("3046.45");
    expect(s(row.sgst)).toBe("3046.44");
    expect(s(row.totalAmount)).toBe("39942.29");
    expect(s(row.gstPercentage)).toBe("18");
  });

  it("odd-paise tax: cgst + sgst equals the tax exactly, and the total is taxable + tax", async () => {
    // 1 h x 100.50 at 5% -> tax 5.025 -> 5.03 ; cgst 2.515 -> 2.52 ; sgst 2.51
    const [session] = await makeSessions(t, [1]);
    const { bill } = ok(
      await createBill(
        t.businessId,
        t.actor,
        billInput(t, [session.id], {
          ratePerHour: 100.5,
          billType: "GST",
          gstPercentage: 5,
          billNumber: `GST-${uniq()}`,
        }),
      ),
    );
    const row = await fresh(bill.id);
    expect(s(row.cgst)).toBe("2.52");
    expect(s(row.sgst)).toBe("2.51");
    const tax = row.cgst!.plus(row.sgst!);
    expect(tax.toString()).toBe("5.03");
    expect(row.subtotal.plus(tax).equals(row.totalAmount)).toBe(true);
    expect(s(row.totalAmount)).toBe("105.53");
  });

  it("rounds a half-paisa rate HALF_UP (1.005 -> 1.01), not down like a float", async () => {
    const [session] = await makeSessions(t, [1]);
    const { bill } = ok(await createBill(t.businessId, t.actor, billInput(t, [session.id], { ratePerHour: 1.005 })));
    const row = await fresh(bill.id);
    expect(s(row.items[0].ratePerHour)).toBe("1.01");
    expect(s(row.totalAmount)).toBe("1.01");
  });

  it("is exact for fractional hours that floats cannot represent (0.1 h + 0.2 h)", async () => {
    const sessions = await makeSessions(t, [0.1, 0.2]);
    const { bill } = ok(await createBill(t.businessId, t.actor, billInput(t, sessions.map((x) => x.id), { ratePerHour: 10 })));
    const row = await fresh(bill.id);
    expect(s(row.subtotal)).toBe("3"); // 1.00 + 2.00
    expect(s(row.totalAmount)).toBe("3");
  });

  it("refuses a negative total (discount larger than the work) with a 422-style failure", async () => {
    const [session] = await makeSessions(t, [1]);
    const f = failed(await createBill(t.businessId, t.actor, billInput(t, [session.id], { ratePerHour: 100, discount: 500 })));
    expect(f.code).toBe("VALIDATION_FAILED");
    // Nothing was written and the session is still billable.
    expect(await db.billItem.count({ where: { workSessionId: session.id } })).toBe(0);
  });
});

describe("bill numbers", () => {
  it("hands out Non-GST numbers sequentially, a manual number never advances the sequence", async () => {
    const tenant = await createTenant("bill-numbers");
    try {
      expect(await previewNextNonGstBillNumber(tenant.businessId)).toBe("NG-0001");
      const a = await makeSessions(tenant, [1, 1, 1, 1]);
      const first = ok(await createBill(tenant.businessId, tenant.actor, billInput(tenant, [a[0].id])));
      const second = ok(await createBill(tenant.businessId, tenant.actor, billInput(tenant, [a[1].id])));
      expect([first.bill.billNumber, second.bill.billNumber]).toEqual(["NG-0001", "NG-0002"]);

      const manual = ok(await createBill(tenant.businessId, tenant.actor, billInput(tenant, [a[2].id], { billNumber: "NG-0003" })));
      expect(manual.bill.billNumber).toBe("NG-0003");
      // The sequence did not move, so the next auto number collides with the
      // manual one and is skipped instead of failing forever.
      const next = ok(await createBill(tenant.businessId, tenant.actor, billInput(tenant, [a[3].id])));
      expect(next.bill.billNumber).toBe("NG-0004");
    } finally {
      await cleanupTenant(tenant.businessId);
    }
  });

  it("rejects a manual bill number that is already used with BILL_NUMBER_TAKEN and writes nothing", async () => {
    const number = `MAN-${uniq()}`;
    const [a, b] = await makeSessions(t, [1, 1]);
    ok(await createBill(t.businessId, t.actor, billInput(t, [a.id], { billNumber: number })));
    const before = await db.bill.count({ where: { businessId: t.businessId } });

    const f = failed(await createBill(t.businessId, t.actor, billInput(t, [b.id], { billNumber: number })));
    expect(f.code).toBe("BILL_NUMBER_TAKEN");
    expect(await db.bill.count({ where: { businessId: t.businessId } })).toBe(before);
    expect(await db.billItem.count({ where: { workSessionId: b.id } })).toBe(0);
  });
});

describe("createSummaryBill", () => {
  it("builds a bill from typed-in lines (no work sessions) with exact totals and GST", async () => {
    // line 1: 7.25 x 1234.56 = 8950.56 ; line 2: 3 x 999.99 = 2999.97 ; subtotal 11950.53
    // + transport 250 - discount 0.53 = 12200.00 ; 12% GST = 1464.00 ; total 13664.00
    const input = summaryInput(t, {
      billType: "GST",
      gstPercentage: 12,
      billNumber: `GST-${uniq()}`,
      transportCharges: 250,
      discount: 0.53,
      items: [
        { excavatorId: t.excavatorId, siteName: "Site A", fromDate: "2026-10-01", toDate: "2026-10-02", hours: 7.25, ratePerHour: 1234.56 },
        { excavatorId: t.excavatorId, siteName: "Site B", attachment: "Breaker", fromDate: "2026-10-03", toDate: "2026-10-03", hours: 3, ratePerHour: 999.99 },
      ],
    });
    const { bill } = ok(await createSummaryBill(t.businessId, t.actor, input));
    const row = await fresh(bill.id);
    expect(row.isDirect).toBe(false);
    expect(row.items).toHaveLength(2);
    expect(row.items.every((i) => i.workSessionId === null)).toBe(true);
    expect(row.items.map((i) => s(i.amount)).sort()).toEqual(["2999.97", "8950.56"]);
    expect(s(row.subtotal)).toBe("11950.53");
    expect(s(row.cgst)).toBe("732");
    expect(s(row.sgst)).toBe("732");
    expect(s(row.totalAmount)).toBe("13664");
  });

  it("does not touch logged work and rejects another tenant's machine or customer", async () => {
    const other = await createTenant("bill-summary-other");
    try {
      const f1 = failed(
        await createSummaryBill(
          t.businessId,
          t.actor,
          summaryInput(t, {
            items: [{ excavatorId: other.excavatorId, siteName: "X", fromDate: "2026-10-01", toDate: "2026-10-01", hours: 1, ratePerHour: 1 }],
          }),
        ),
      );
      expect(f1.code).toBe("NOT_FOUND");
      const f2 = failed(await createSummaryBill(t.businessId, t.actor, summaryInput(t, { customerId: other.customerId })));
      expect(f2.code).toBe("NOT_FOUND");
    } finally {
      await cleanupTenant(other.businessId);
    }
  });

  it("two summary bills may reuse the same machine and dates (no work-session link, so no double-billing guard)", async () => {
    ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
    ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
  });
});

describe("createDirectBill", () => {
  it("computes bucket/breaker lines, GST on (lines + transport) and nets the diesel advance", async () => {
    // bucket 5.5 x 1200.25 = 6601.375 -> 6601.38 ; breaker 2 x 900 = 1800.00 ; subtotal 8401.38
    // taxable = 8401.38 + 250 = 8651.38 ; GST 18% = 1557.2484 -> 1557.25 ; cgst 778.625 -> 778.63 ; sgst 778.62
    // diesel advance = 20 x 91.35 = 1827.00 ; total = 8651.38 + 1557.25 - 1827.00 = 8381.63
    const { bill } = ok(
      await createDirectBill(
        t.businessId,
        t.actor,
        directInput(t, {
          bucketHours: 5.5,
          bucketRate: 1200.25,
          breakerHours: 2,
          breakerRate: 900,
          transportCharges: 250,
          dieselLiters: 20,
          dieselPricePerLiter: 91.35,
          billType: "GST",
          gstPercentage: 18,
          billNumber: `GST-${uniq()}`,
        }),
      ),
    );
    const row = await fresh(bill.id);
    expect(row.isDirect).toBe(true);
    expect(s(row.subtotal)).toBe("8401.38");
    expect(s(row.transportCharges)).toBe("250");
    expect(s(row.dieselAdvance)).toBe("1827");
    expect(s(row.cgst)).toBe("778.63");
    expect(s(row.sgst)).toBe("778.62");
    expect(s(row.totalAmount)).toBe("8381.63");
    expect(row.cgst!.plus(row.sgst!).toString()).toBe("1557.25");
  });

  it("fails with VALIDATION_FAILED when the diesel advance exceeds everything billed", async () => {
    const f = failed(
      await createDirectBill(
        t.businessId,
        t.actor,
        directInput(t, { bucketHours: 1, bucketRate: 100, dieselLiters: 10, dieselPricePerLiter: 100 }),
      ),
    );
    expect(f.code).toBe("VALIDATION_FAILED");
  });

  it("rejects another tenant's customer or machine", async () => {
    const other = await createTenant("bill-direct-other");
    try {
      expect(failed(await createDirectBill(t.businessId, t.actor, directInput(t, { customerId: other.customerId }))).code).toBe("NOT_FOUND");
      expect(failed(await createDirectBill(t.businessId, t.actor, directInput(t, { excavatorId: other.excavatorId }))).code).toBe("NOT_FOUND");
    } finally {
      await cleanupTenant(other.businessId);
    }
  });
});
