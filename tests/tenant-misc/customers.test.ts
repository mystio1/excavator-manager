import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  CUSTOMER_OPTIONS_MAX,
  archiveCustomer,
  createCustomer,
  getCustomerDetail,
  listCustomerOptions,
  listCustomers,
  updateCustomer,
} from "@/lib/services/customers";
import { LEGACY_LIMIT } from "@/lib/pagination";
import { addCustomerSchema, updateCustomerSchema } from "@/lib/validation/customer";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { insertBill, insertCustomer } from "./helpers";

/**
 * Customers: exact money totals, optimistic concurrency, audit trail, cursor
 * pagination and tenant isolation (real database, throwaway tenants).
 */

let a: TestTenant;
let b: TestTenant;

beforeAll(async () => {
  [a, b] = await Promise.all([createTenant("cust-a"), createTenant("cust-b")]);
});

afterAll(async () => {
  await Promise.all([a, b].filter(Boolean).map((t) => cleanupTenant(t.businessId)));
});

const auditRows = (businessId: string, entityId: string) =>
  db.auditLog.findMany({ where: { businessId, entityType: "Customer", entityId }, orderBy: { createdAt: "asc" } });

describe("customer totals are exact (NUMERIC, fractional paise)", () => {
  let tenant: TestTenant;
  let ids: Record<"main" | "tiny" | "small" | "paid" | "many", string>;

  beforeAll(async () => {
    tenant = await createTenant("cust-sums");
    const [main, tiny, small, paid, many] = await Promise.all([
      insertCustomer(tenant, "Main Co"),
      insertCustomer(tenant, "Tiny Dues"),
      insertCustomer(tenant, "Small Dues"),
      insertCustomer(tenant, "Fully Paid"),
      insertCustomer(tenant, "Many Bills"),
    ]);
    ids = { main: main.id, tiny: tiny.id, small: small.id, paid: paid.id, many: many.id };

    // 0.10 + 0.20 + 33.33 + 66.67 = 100.30 billed; 0.10 + 0.20 = 0.30 paid.
    await insertBill(tenant, { customerId: main.id, total: "0.10", payments: ["0.10"] });
    await insertBill(tenant, { customerId: main.id, total: "0.20", payments: ["0.20"] });
    await insertBill(tenant, { customerId: main.id, total: "33.33" });
    await insertBill(tenant, { customerId: main.id, total: "66.67" });
    // One paisa owed: below the "has pending dues" threshold (> 0.01).
    await insertBill(tenant, { customerId: tiny.id, total: "0.01" });
    // Two paise owed: counts as pending dues.
    await insertBill(tenant, { customerId: small.id, total: "0.02" });
    await insertBill(tenant, { customerId: paid.id, total: "10.00", payments: ["4.05", "5.95"] });
    // 25 bills of 0.07: 1.75 exactly (a float sum would drift).
    for (let i = 0; i < 25; i++) await insertBill(tenant, { customerId: many.id, total: "0.07" });
  });

  afterAll(async () => {
    if (tenant) await cleanupTenant(tenant.businessId);
  });

  it("per-customer billed / pending are exact", async () => {
    const { customers } = await listCustomers(tenant.businessId);
    const byName = Object.fromEntries(customers.map((c) => [c.name, c]));
    expect(byName["Main Co"]).toMatchObject({ totalRevenue: 100.3, pending: 100 });
    expect(byName["Tiny Dues"]).toMatchObject({ totalRevenue: 0.01, pending: 0.01 });
    expect(byName["Small Dues"]).toMatchObject({ totalRevenue: 0.02, pending: 0.02 });
    expect(byName["Fully Paid"]).toMatchObject({ totalRevenue: 10, pending: 0 });
    expect(byName["Many Bills"]).toMatchObject({ totalRevenue: 1.75, pending: 1.75 });
    // The tenant's seed customer has no bills at all.
    expect(byName["Test Customer"]).toMatchObject({ totalRevenue: 0, pending: 0, tripCount: 0 });
  });

  it("the summary covers the whole list, exactly", async () => {
    const { summary } = await listCustomers(tenant.businessId);
    // 100.30 + 0.01 + 0.02 + 10.00 + 1.75 = 112.08; paid 0.30 + 10.00 = 10.30.
    expect(summary).toEqual({
      totalCustomers: 6,
      withPendingDues: 3, // Main Co, Small Dues, Many Bills (Tiny Dues owes exactly one paisa)
      totalRevenue: 112.08,
      pendingPayments: 101.78,
    });
  });

  it("the customer detail totals match the list", async () => {
    const detail = await getCustomerDetail(tenant.businessId, ids.main);
    expect(detail).toMatchObject({ totalRevenue: 100.3, pending: 100 });
    const many = await getCustomerDetail(tenant.businessId, ids.many);
    expect(many).toMatchObject({ totalRevenue: 1.75, pending: 1.75 });
  });

  it("serializes money as plain numbers (JSON) with the existing keys", async () => {
    const page = await listCustomers(tenant.businessId);
    const row = JSON.parse(JSON.stringify(page)).customers.find((c: { name: string }) => c.name === "Main Co");
    expect(Object.keys(row).sort()).toEqual(["companyName", "id", "mobile", "name", "pending", "totalRevenue", "tripCount"]);
    expect(typeof row.totalRevenue).toBe("number");
    expect(typeof row.pending).toBe("number");
  });
});

describe("customer list pagination", () => {
  let tenant: TestTenant;

  beforeAll(async () => {
    tenant = await createTenant("cust-page");
    // 7 more customers (the seed one makes 8); two share a name so the id tie-breaker matters.
    for (const name of ["Delta", "Alpha", "Echo", "Charlie", "Bravo", "Bravo", "Foxtrot"]) {
      await insertCustomer(tenant, name);
    }
  });

  afterAll(async () => {
    if (tenant) await cleanupTenant(tenant.businessId);
  });

  it("pages in name order with a stable cursor and covers every row exactly once", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listCustomers(tenant.businessId, undefined, undefined, { limit: 3, cursor });
      pages++;
      expect(page.customers.length).toBeLessThanOrEqual(3);
      // The whole-list summary comes with the first page only.
      if (cursor) expect(page.summary).toBeNull();
      else expect(page.summary?.totalCustomers).toBe(8);
      seen.push(...page.customers.map((c) => c.name));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toEqual(["Alpha", "Bravo", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Test Customer"]);
  });

  it("returns no cursor when everything fits in one page", async () => {
    const page = await listCustomers(tenant.businessId, undefined, undefined, { limit: 50, cursor: undefined });
    expect(page.nextCursor).toBeNull();
    expect(page.customers).toHaveLength(8);
  });

  it("filters by search text (case-insensitive) and paginates the filtered list", async () => {
    const page = await listCustomers(tenant.businessId, "bravo", undefined, { limit: 1, cursor: undefined });
    expect(page.customers.map((c) => c.name)).toEqual(["Bravo"]);
    expect(page.nextCursor).not.toBeNull();
    expect(page.summary?.totalCustomers).toBe(2);
    const next = await listCustomers(tenant.businessId, "bravo", undefined, { limit: 1, cursor: page.nextCursor ?? undefined });
    expect(next.customers.map((c) => c.name)).toEqual(["Bravo"]);
    expect(next.nextCursor).toBeNull();
  });

  it("without a page (older apps) returns a bounded legacy page", async () => {
    const legacy = await listCustomers(tenant.businessId);
    expect(legacy.customers).toHaveLength(8);
    expect(LEGACY_LIMIT).toBe(200);
  });

  it("the options list is complete, name-ordered and documented as bounded", async () => {
    const options = await listCustomerOptions(tenant.businessId);
    expect(options.map((o) => o.name)).toEqual(["Alpha", "Bravo", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Test Customer"]);
    expect(Object.keys(options[0]).sort()).toEqual(["companyName", "gstNumber", "id", "name"]);
    expect(CUSTOMER_OPTIONS_MAX).toBe(1000);
  });

  it("archived customers disappear from the list and the options", async () => {
    const extra = await insertCustomer(tenant, "Archived Soon");
    await archiveCustomer(tenant.businessId, tenant.actor, extra.id);
    const page = await listCustomers(tenant.businessId, "Archived", undefined, { limit: 50, cursor: undefined });
    expect(page.customers).toHaveLength(0);
    expect((await listCustomerOptions(tenant.businessId)).some((o) => o.id === extra.id)).toBe(false);
  });
});

describe("customer create / update / archive: audit + versioning", () => {
  it("create writes an audit row with the new record", async () => {
    const created = await createCustomer(a.businessId, a.actor, { name: "Audited Customer", mobile: "9555555555" });
    expect(created.version).toBe(0);

    const rows = await auditRows(a.businessId, created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "customer.create", actorType: "OWNER", actorId: a.userId, entityType: "Customer" });
    expect(rows[0].before).toBeNull();
    expect(rows[0].after).toMatchObject({ name: "Audited Customer", mobile: "9555555555" });
  });

  it("update bumps the version, audits before/after and honours expectedVersion", async () => {
    const created = await createCustomer(a.businessId, a.actor, { name: "Versioned", mobile: "9666666666" });

    const first = await updateCustomer(
      a.businessId,
      a.actor,
      created.id,
      { name: "Versioned Renamed", mobile: "9666666666", companyName: "Acme" },
      { expectedVersion: 0 },
    );
    if ("error" in first) throw new Error(first.error);
    expect(first.customer.version).toBe(1);
    expect(first.customer.name).toBe("Versioned Renamed");

    // A second editor still holding version 0 is refused, and nothing changes.
    const stale = await updateCustomer(
      a.businessId,
      a.actor,
      created.id,
      { name: "Stale Overwrite", mobile: "9666666666" },
      { expectedVersion: 0 },
    );
    expect(stale).toMatchObject({ code: "RESOURCE_MODIFIED" });
    if ("error" in stale) expect(typeof stale.error).toBe("string");
    const afterStale = await db.customer.findUniqueOrThrow({ where: { id: created.id } });
    expect(afterStale).toMatchObject({ name: "Versioned Renamed", version: 1, companyName: "Acme" });

    // The current version succeeds.
    const second = await updateCustomer(
      a.businessId,
      a.actor,
      created.id,
      { name: "Versioned Again", mobile: "9666666666" },
      { expectedVersion: 1 },
    );
    if ("error" in second) throw new Error(second.error);
    expect(second.customer.version).toBe(2);
    expect(second.customer.companyName).toBeNull(); // omitted optional fields are cleared, as before

    // Omitting expectedVersion (older apps) skips the check but still bumps the version.
    const legacy = await updateCustomer(a.businessId, a.actor, created.id, { name: "Legacy Edit", mobile: "9666666666" });
    if ("error" in legacy) throw new Error(legacy.error);
    expect(legacy.customer.version).toBe(3);

    const rows = await auditRows(a.businessId, created.id);
    expect(rows.map((r) => r.action)).toEqual(["customer.create", "customer.update", "customer.update", "customer.update"]);
    // The refused edit left no audit row; each successful one carries a true before -> after pair.
    expect(rows[1].before).toMatchObject({ name: "Versioned", version: 0 });
    expect(rows[1].after).toMatchObject({ name: "Versioned Renamed", version: 1, companyName: "Acme" });
    expect(rows[2].before).toMatchObject({ name: "Versioned Renamed", version: 1 });
    expect(rows[2].after).toMatchObject({ name: "Versioned Again", version: 2 });
    expect(rows[3].after).toMatchObject({ name: "Legacy Edit", version: 3 });
  });

  it("two concurrent edits with the same expectedVersion: exactly one wins", async () => {
    const created = await createCustomer(a.businessId, a.actor, { name: "Race", mobile: "9777777777" });
    const results = await Promise.all(
      ["Racer One", "Racer Two"].map((name) =>
        updateCustomer(a.businessId, a.actor, created.id, { name, mobile: "9777777777" }, { expectedVersion: 0 }),
      ),
    );
    const winners = results.filter((r) => !("error" in r));
    const losers = results.filter((r) => "error" in r);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toMatchObject({ code: "RESOURCE_MODIFIED" });

    expect((await db.customer.findUniqueOrThrow({ where: { id: created.id } })).version).toBe(1);
    expect(await auditRows(a.businessId, created.id)).toHaveLength(2); // create + the one update
  });

  it("archive hides the customer, bumps the version and writes an audit row (idempotent)", async () => {
    const created = await createCustomer(a.businessId, a.actor, { name: "To Archive", mobile: "9888888888" });

    const archived = await archiveCustomer(a.businessId, a.actor, created.id);
    if ("error" in archived) throw new Error(archived.error);
    expect(archived.customer).toMatchObject({ isArchived: true, version: 1 });

    // Archiving again is a no-op success with no second audit row.
    const again = await archiveCustomer(a.businessId, a.actor, created.id);
    expect("error" in again).toBe(false);

    const rows = await auditRows(a.businessId, created.id);
    expect(rows.map((r) => r.action)).toEqual(["customer.create", "customer.archive"]);
    expect(rows[1].before).toMatchObject({ isArchived: false });
    expect(rows[1].after).toMatchObject({ isArchived: true });
    expect(rows[1]).toMatchObject({ actorType: "OWNER", actorId: a.userId });

    // History is kept: the row still exists and the detail still loads.
    expect(await getCustomerDetail(a.businessId, created.id)).not.toBeNull();
  });

  it("an unknown customer id is NOT_FOUND for update and archive", async () => {
    expect(await updateCustomer(a.businessId, a.actor, "does-not-exist", { name: "X", mobile: "9000000001" })).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await archiveCustomer(a.businessId, a.actor, "does-not-exist")).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("customer validation", () => {
  it("accepts expectedVersion as an optional non-negative integer", () => {
    const base = { name: "N", mobile: "9000000002" };
    expect(updateCustomerSchema.safeParse(base).success).toBe(true);
    expect(updateCustomerSchema.safeParse({ ...base, expectedVersion: 3 }).success).toBe(true);
    expect(updateCustomerSchema.safeParse({ ...base, expectedVersion: -1 }).success).toBe(false);
    expect(updateCustomerSchema.safeParse({ ...base, expectedVersion: 1.5 }).success).toBe(false);
  });

  it("still rejects a blank name", () => {
    expect(addCustomerSchema.safeParse({ name: "  ", mobile: "9000000003" }).success).toBe(false);
  });
});

describe("customers: tenant isolation", () => {
  let aCustomerId: string;

  beforeAll(async () => {
    const created = await createCustomer(a.businessId, a.actor, { name: "Tenant A Only", mobile: "9101010101" });
    aCustomerId = created.id;
    await insertBill(a, { customerId: aCustomerId, total: "500.00" });
  });

  it("tenant B cannot read tenant A's customer", async () => {
    expect(await getCustomerDetail(b.businessId, aCustomerId)).toBeNull();
    expect((await listCustomers(b.businessId)).customers.some((c) => c.id === aCustomerId)).toBe(false);
    expect((await listCustomerOptions(b.businessId)).some((c) => c.id === aCustomerId)).toBe(false);
    expect((await listCustomers(b.businessId, "Tenant A Only")).customers).toHaveLength(0);
  });

  it("tenant B cannot update or archive tenant A's customer, and no audit row is written for it", async () => {
    const update = await updateCustomer(b.businessId, b.actor, aCustomerId, { name: "Hijacked", mobile: "9999999999" });
    expect(update).toMatchObject({ code: "NOT_FOUND" });
    const archive = await archiveCustomer(b.businessId, b.actor, aCustomerId);
    expect(archive).toMatchObject({ code: "NOT_FOUND" });

    const row = await db.customer.findUniqueOrThrow({ where: { id: aCustomerId } });
    expect(row).toMatchObject({ name: "Tenant A Only", isArchived: false, version: 0, businessId: a.businessId });
    expect(await auditRows(b.businessId, aCustomerId)).toHaveLength(0);
  });

  it("tenant totals never include another tenant's bills", async () => {
    const aTotals = (await listCustomers(a.businessId)).summary;
    const bTotals = (await listCustomers(b.businessId)).summary;
    expect(aTotals?.totalRevenue).toBeGreaterThanOrEqual(500);
    expect(bTotals?.totalRevenue).toBe(0);
    expect(bTotals?.pendingPayments).toBe(0);
  });
});
