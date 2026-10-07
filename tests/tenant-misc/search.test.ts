import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { SEARCH_PREVIEW_LIMIT, globalSearch } from "@/lib/services/search";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { insertBill, insertCustomer } from "./helpers";

/** Global search: case-insensitive, per-group cursor pagination, tenant isolation. */

let a: TestTenant;
let b: TestTenant;
let aBillNumber: string;

beforeAll(async () => {
  [a, b] = await Promise.all([createTenant("search-a"), createTenant("search-b")]);
  const bill = await insertBill(a, { total: "10.00" });
  aBillNumber = bill.billNumber;
  await insertBill(b, { total: "20.00" });
  for (let i = 1; i <= 9; i++) await insertCustomer(a, `Paged ${i}`);
});

afterAll(async () => {
  await Promise.all([a, b].filter(Boolean).map((t) => cleanupTenant(t.businessId)));
  await db.$disconnect();
});

describe("globalSearch", () => {
  it("finds machines, customers, operators and bills of the tenant (case-insensitive)", async () => {
    const results = await globalSearch(a.businessId, "test");
    expect(results.excavators.map((e) => e.id)).toEqual([a.excavatorId]);
    expect(results.customers.map((c) => c.id)).toEqual([a.customerId]);
    expect(results.operators.map((o) => o.id)).toEqual([a.operatorId]);

    const byBill = await globalSearch(a.businessId, aBillNumber.toLowerCase());
    expect(byBill.bills).toHaveLength(1);
    expect(byBill.bills[0].billNumber).toBe(aBillNumber);
    // Money leaves the service as an exact Decimal and reaches the client as a plain number.
    expect(JSON.parse(JSON.stringify(byBill.bills[0])).totalAmount).toBe(10);
  });

  it("never returns another tenant's rows", async () => {
    const results = await globalSearch(b.businessId, "test");
    expect(results.excavators.map((e) => e.id)).toEqual([b.excavatorId]);
    expect(results.customers.map((c) => c.id)).toEqual([b.customerId]);
    expect(results.operators.map((o) => o.id)).toEqual([b.operatorId]);

    // A's bill number does not exist for B, nor A's customers.
    expect((await globalSearch(b.businessId, aBillNumber)).bills).toHaveLength(0);
    expect((await globalSearch(b.businessId, "Paged")).customers).toHaveLength(0);
  });

  it("limits the combined search to a preview and reports which groups have more", async () => {
    const results = await globalSearch(a.businessId, "paged");
    expect(results.customers).toHaveLength(SEARCH_PREVIEW_LIMIT);
    expect(results.nextCursors.customers).not.toBeNull();
    expect(results.nextCursors.excavators).toBeNull();
    expect(results.nextCursors.bills).toBeNull();
  });

  it("pages a single group with a stable cursor and covers every hit once", async () => {
    const names: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await globalSearch(a.businessId, "paged", { group: "customers", page: { limit: 4, cursor } });
      pages++;
      names.push(...page.customers.map((c) => c.name));
      // The other groups are not queried in group mode.
      expect(page.excavators).toEqual([]);
      expect(page.bills).toEqual([]);
      cursor = page.nextCursors.customers ?? undefined;
    } while (cursor);

    expect(pages).toBe(3);
    expect(names).toEqual(Array.from({ length: 9 }, (_, i) => `Paged ${i + 1}`));
  });

  it("a blank query returns empty groups without touching the database", async () => {
    const results = await globalSearch(a.businessId, "   ");
    expect(results).toEqual({
      excavators: [],
      customers: [],
      operators: [],
      bills: [],
      nextCursors: { excavators: null, customers: null, operators: null, bills: null },
    });
  });
});
