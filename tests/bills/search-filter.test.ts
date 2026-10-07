import "./pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDirectBill, createSummaryBill, listBills } from "@/lib/services/bills";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { db } from "@/lib/db";

/** Search and the By App / Self Made filters run on the server, so they cover
 * EVERY bill — not just the first page the browser loaded. */
describe("bills list: server-side search and filter across pages", () => {
  let t: TestTenant;
  beforeAll(async () => {
    t = await createTenant("bill-search");
    const mk = (n: number) =>
      createSummaryBill(t.businessId, t.actor, {
        customerId: t.customerId, billDate: `2026-09-${String(n).padStart(2, "0")}`, billType: "NON_GST",
        billNumber: `SRCH-${String(n).padStart(3, "0")}`,
        transportCharges: 0, fuelCharges: 0, extraCharges: 0, bucketCharge: 0, breakerCharge: 0, discount: 0,
        showCustomerPhone: true,
        items: [{ excavatorId: t.excavatorId, siteName: n === 1 ? "Rare Quarry Site" : "Common Site", fromDate: "2026-09-01", toDate: "2026-09-01", hours: n, ratePerHour: 1000 }],
      } as never);
    for (let n = 1; n <= 12; n++) {
      const r = await mk(n);
      if ("error" in r) throw new Error(r.error);
    }
    const d = await createDirectBill(t.businessId, t.actor, {
      customerId: t.customerId, excavatorId: t.excavatorId, billDate: "2026-08-01", fromDate: "2026-08-01", toDate: "2026-08-01",
      bucketHours: 1, bucketRate: 1000, breakerHours: 0, breakerRate: 0, transportCharges: 0, dieselLiters: 0, dieselPricePerLiter: 0,
      billType: "NON_GST", billNumber: "SRCH-DIRECT", showCustomerPhone: true,
    } as never);
    if ("error" in d) throw new Error(d.error);
  }, 120_000);
  afterAll(async () => {
    if (t) await cleanupTenant(t.businessId);
    await db.$disconnect();
  }, 120_000);

  it("finds an OLD bill by number even when it is beyond the first page", async () => {
    const firstPage = await listBills(t.businessId, {}, { limit: 3 });
    expect(firstPage.items.map((b) => b.billNumber)).not.toContain("SRCH-001");
    const found = await listBills(t.businessId, { q: "SRCH-001" }, { limit: 3 });
    expect(found.items.map((b) => b.billNumber)).toEqual(["SRCH-001"]);
  });

  it("finds a bill by one of its line items' site name", async () => {
    const found = await listBills(t.businessId, { q: "rare quarry" }, { limit: 50 });
    expect(found.items.map((b) => b.billNumber)).toEqual(["SRCH-001"]);
  });

  it("matches by exact amount and by customer name, AND-ing several words", async () => {
    const byAmount = await listBills(t.businessId, { q: "5000" }, { limit: 50 });
    expect(byAmount.items.map((b) => b.billNumber)).toEqual(["SRCH-005"]);
    const both = await listBills(t.businessId, { q: "test customer SRCH-012" }, { limit: 50 });
    expect(both.items.map((b) => b.billNumber)).toEqual(["SRCH-012"]);
    const none = await listBills(t.businessId, { q: "test customer nonexistent-word" }, { limit: 50 });
    expect(none.items).toHaveLength(0);
  });

  it("the Self Made filter returns the direct bill even though it is the OLDEST of 13", async () => {
    const self = await listBills(t.businessId, { isDirect: true }, { limit: 3 });
    expect(self.items.map((b) => b.billNumber)).toEqual(["SRCH-DIRECT"]);
    const app = await listBills(t.businessId, { isDirect: false }, { limit: 50 });
    expect(app.items).toHaveLength(12);
  });

  it("search never crosses tenants", async () => {
    const other = await createTenant("bill-search-other");
    try {
      const res = await listBills(other.businessId, { q: "SRCH" }, { limit: 50 });
      expect(res.items).toHaveLength(0);
    } finally {
      await cleanupTenant(other.businessId);
    }
  });
});
