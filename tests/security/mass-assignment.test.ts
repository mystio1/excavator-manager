import "../bills/pool";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { addPayment, createSummaryBill } from "@/lib/services/bills";
import { cleanupTenant, createCompletedSession, createTenant, type TestTenant } from "../helpers/tenant";
import { actAs } from "../bills/session-mock";
import { ctx, req } from "../bills/route-helpers";
import { ok, summaryInput } from "../bills/helpers";

import { POST as customerCreatePOST } from "@/app/api/customers/route";
import { PATCH as customerPATCH } from "@/app/api/customers/[id]/route";
import { PATCH as excavatorPATCH } from "@/app/api/excavators/[id]/route";
import { POST as operatorCreatePOST } from "@/app/api/operators/route";
import { PATCH as operatorPATCH } from "@/app/api/operators/[id]/route";
import { PATCH as billPATCH } from "@/app/api/bills/[id]/route";
import { POST as payPOST } from "@/app/api/bills/[id]/payments/route";
import { PATCH as payPATCH } from "@/app/api/bills/[id]/payments/[paymentId]/route";
import { PATCH as profilePATCH } from "@/app/api/settings/profile/route";
import { PATCH as sessionPATCH } from "@/app/api/work-sessions/[id]/route";

vi.mock("@/lib/session", () => import("../bills/session-mock"));

/**
 * Field-level authorization / mass assignment.
 *
 * A signed-in owner may legitimately change a record's *editable* fields, but the request body must never
 * be able to set fields the server owns: the tenant (businessId), ids, timestamps, the optimistic-concurrency
 * version, derived money (paidAmount / totalAmount / status), the frozen letterhead, archive flags, and the
 * account-security fields (tokenVersion, canLogin, pinHash, business frozen / limits / code).
 *
 * Each case sends a perfectly valid body PLUS the forbidden fields and then re-reads the row. The
 * schemas strip unknown keys; these tests make that a guarantee that fails loudly if a future change
 * spreads a request body into a Prisma `data` object.
 */

let A: TestTenant;
let B: TestTenant;
const day = "2026-10-02";

beforeAll(async () => {
  A = await createTenant("mass-a");
  B = await createTenant("mass-b");
  actAs(A);
});
afterAll(async () => {
  actAs(null);
  await cleanupTenant(A.businessId);
  await cleanupTenant(B.businessId);
  await db.$disconnect();
});

/** Fields that no request body may set, whatever the model. */
const FORBIDDEN = {
  businessId: "", // filled per test with the OTHER tenant
  id: "attacker-chosen-id",
  createdAt: "2000-01-01T00:00:00.000Z",
  updatedAt: "2000-01-01T00:00:00.000Z",
  version: 777,
  isArchived: true,
};

describe("create routes ignore server-owned fields", () => {
  it("POST /api/customers: tenant, id, createdAt, version and archive flag come from the server", async () => {
    const res = await customerCreatePOST(
      req("POST", "/x", { body: { name: "Mass Customer", mobile: "9000011111", ...FORBIDDEN, businessId: B.businessId } }),
      undefined,
    );
    expect(res.status).toBe(200);
    const { customer } = await res.json();
    const row = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(row.businessId).toBe(A.businessId);
    expect(row.id).not.toBe(FORBIDDEN.id);
    expect(row.isArchived).toBe(false);
    expect(row.version).toBe(0);
    expect(row.createdAt.getFullYear()).toBeGreaterThanOrEqual(2026);
    expect(await db.customer.count({ where: { businessId: B.businessId, name: "Mass Customer" } })).toBe(0);
  });

  it("POST /api/operators: cannot create an operator with login enabled, a PIN hash or a token version", async () => {
    const res = await operatorCreatePOST(
      req("POST", "/x", {
        body: { name: "Mass Operator", mobile: "9000022222", ...FORBIDDEN, businessId: B.businessId, canLogin: true, pinHash: "attacker", tokenVersion: 99 },
      }),
      undefined,
    );
    expect(res.status).toBe(200);
    const { operator } = await res.json();
    const row = await db.operator.findUniqueOrThrow({ where: { id: operator.id } });
    expect(row).toMatchObject({ businessId: A.businessId, canLogin: false, pinHash: null, tokenVersion: 0, isArchived: false, version: 0 });
  });
});

describe("update routes ignore server-owned fields", () => {
  it("PATCH /api/customers/[id]", async () => {
    const before = await db.customer.findUniqueOrThrow({ where: { id: A.customerId } });
    const res = await customerPATCH(
      req("PATCH", "/x", { body: { name: "Renamed", mobile: "9000033333", ...FORBIDDEN, businessId: B.businessId } }),
      ctx({ id: A.customerId }),
    );
    expect(res.status).toBe(200);
    const row = await db.customer.findUniqueOrThrow({ where: { id: A.customerId } });
    expect(row.name).toBe("Renamed"); // the editable field did change
    expect(row.businessId).toBe(A.businessId);
    expect(row.isArchived).toBe(false);
    expect(row.version).toBe(before.version + 1); // bumped by the server, not set to 777
    expect(row.createdAt.getTime()).toBe(before.createdAt.getTime());
  });

  it("PATCH /api/excavators/[id]", async () => {
    const before = await db.excavator.findUniqueOrThrow({ where: { id: A.excavatorId } });
    const res = await excavatorPATCH(
      req("PATCH", "/x", { body: { name: "Renamed JCB", ...FORBIDDEN, businessId: B.businessId, status: "UNDER_MAINTENANCE", sortOrder: 999, currentOperatorId: B.operatorId } }),
      ctx({ id: A.excavatorId }),
    );
    expect(res.status).toBe(200);
    const row = await db.excavator.findUniqueOrThrow({ where: { id: A.excavatorId } });
    expect(row.name).toBe("Renamed JCB");
    expect(row.businessId).toBe(A.businessId);
    expect(row.isArchived).toBe(false);
    expect(row.version).toBe(before.version + 1);
    expect(row.status).toBe(before.status);
    expect(row.sortOrder).toBe(before.sortOrder);
    expect(row.currentOperatorId).toBe(before.currentOperatorId);
  });

  it("PATCH /api/operators/[id]: cannot enable login, set a PIN hash or bump/reset tokenVersion", async () => {
    const before = await db.operator.findUniqueOrThrow({ where: { id: A.operatorId } });
    const res = await operatorPATCH(
      req("PATCH", "/x", {
        body: { name: "Renamed Op", mobile: "9000044444", ...FORBIDDEN, businessId: B.businessId, canLogin: true, pinHash: "attacker", tokenVersion: 99 },
      }),
      ctx({ id: A.operatorId }),
    );
    expect(res.status).toBe(200);
    const row = await db.operator.findUniqueOrThrow({ where: { id: A.operatorId } });
    expect(row.name).toBe("Renamed Op");
    expect(row).toMatchObject({ businessId: A.businessId, canLogin: before.canLogin, pinHash: before.pinHash, tokenVersion: before.tokenVersion, isArchived: false });
    expect(row.version).toBe(before.version + 1);
  });

  it("PATCH /api/settings/profile: cannot unfreeze/limit-raise itself, change its business code or id", async () => {
    const before = await db.business.findUniqueOrThrow({ where: { id: A.businessId } });
    const res = await profilePATCH(
      req("PATCH", "/x", {
        body: {
          name: "Renamed Business",
          ownerName: "Owner",
          phone: "9000055555",
          defaultServiceIntervalHrs: 250,
          maintenanceAlertThresholdHrs: 20,
          frozen: true, // an owner cannot freeze/unfreeze itself — that is a support action
          maxOperators: 1000,
          maxBillsPerDay: 100000,
          code: "HACKED1",
          id: B.businessId,
        },
      }),
      undefined,
    );
    expect(res.status).toBe(200);
    const row = await db.business.findUniqueOrThrow({ where: { id: A.businessId } });
    expect(row.name).toBe("Renamed Business");
    expect(row).toMatchObject({ frozen: before.frozen, maxOperators: before.maxOperators, maxBillsPerDay: before.maxBillsPerDay, code: before.code });
    expect(await db.business.findUnique({ where: { id: B.businessId }, select: { name: true } })).not.toMatchObject({ name: "Renamed Business" });
  });

  it("PATCH /api/work-sessions/[id]: status, tenant and machine cannot be set from the body", async () => {
    const s = await createCompletedSession(A, { totalHours: 5 });
    const before = await db.workSession.findUniqueOrThrow({ where: { id: s.id } });
    const res = await sessionPATCH(
      req("PATCH", "/x", {
        body: {
          customerId: A.customerId,
          operatorId: A.operatorId,
          siteName: "Mass site",
          startDate: day,
          endDate: day,
          startHourMeter: 100,
          endHourMeter: 105,
          totalHours: 5,
          ...FORBIDDEN,
          businessId: B.businessId,
          status: "ACTIVE",
          excavatorId: B.excavatorId,
        },
      }),
      ctx({ id: s.id }),
    );
    expect(res.status).toBe(200);
    const row = await db.workSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row).toMatchObject({ businessId: A.businessId, excavatorId: before.excavatorId, status: before.status });
    expect(row.version).toBe(before.version + 1);
  });
});

describe("money routes: derived values cannot be set from the body", () => {
  it("PATCH /api/bills/[id]: totalAmount/paidAmount/status/letterhead/tenant are server-derived", async () => {
    const { bill } = ok(await createSummaryBill(A.businessId, A.actor, summaryInput(A)));
    ok(await addPayment(A.businessId, A.actor, { billId: bill.id, amount: 100, date: day }));
    const before = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });

    const res = await billPATCH(
      req("PATCH", "/x", {
        body: {
          customerId: A.customerId,
          billDate: day,
          billNumber: before.billNumber,
          billType: "NON_GST",
          items: [{ id: undefined, excavatorId: A.excavatorId, siteName: "S", fromDate: day, toDate: day, hours: 2, ratePerHour: 1000 }],
          // forbidden / server-derived
          totalAmount: 1,
          subtotal: 1,
          paidAmount: 999999,
          status: "PAID",
          letterhead: { businessName: "Forged Ltd" },
          ...FORBIDDEN,
          businessId: B.businessId,
          version: 777,
        },
      }),
      ctx({ id: bill.id }),
    );
    expect(res.status).toBe(200);
    const row = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(row.totalAmount.toString()).toBe("2000"); // 2 h x 1000, computed — not the 1 the body asked for
    expect(row.paidAmount.toString()).toBe("100"); // sum of payments, not 999999
    expect(row.status).toBe("PARTIAL");
    expect(row.businessId).toBe(A.businessId);
    expect(row.letterhead).toEqual(before.letterhead); // frozen letterhead cannot be replaced
    expect(row.version).toBe(before.version + 1);
  });

  it("POST /api/bills/[id]/payments and PATCH payment: tenant, bill, version and timestamps come from the server", async () => {
    const { bill } = ok(await createSummaryBill(A.businessId, A.actor, summaryInput(A)));
    const other = ok(await createSummaryBill(A.businessId, A.actor, summaryInput(A))).bill;

    const created = await payPOST(
      req("POST", "/x", { body: { amount: 50, date: day, ...FORBIDDEN, businessId: B.businessId, billId: other.id } }),
      ctx({ id: bill.id }),
    );
    expect(created.status).toBe(201);
    const { payment } = await created.json();
    const row = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(row).toMatchObject({ businessId: A.businessId, billId: bill.id, version: 0 });
    expect(row.id).not.toBe(FORBIDDEN.id);

    const patched = await payPATCH(
      req("PATCH", "/x", { body: { amount: 60, date: day, ...FORBIDDEN, businessId: B.businessId, billId: other.id } }),
      ctx({ id: bill.id, paymentId: payment.id }),
    );
    expect(patched.status).toBe(200);
    const after = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after).toMatchObject({ businessId: A.businessId, billId: bill.id, version: 1 });
    expect(after.amount.toString()).toBe("60");
    expect((await db.bill.findUniqueOrThrow({ where: { id: other.id } })).paidAmount.toString()).toBe("0"); // the other bill was never touched
  });

  it("an out-of-range or negative money field is rejected rather than coerced", async () => {
    const { bill } = ok(await createSummaryBill(A.businessId, A.actor, summaryInput(A)));
    const res = await payPOST(req("POST", "/x", { body: { amount: -5, date: day } }), ctx({ id: bill.id }));
    expect(res.status).toBe(422);
  });
});
