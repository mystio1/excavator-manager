import "./pool";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { GET as listBillsRoute, POST as createBillRoute } from "@/app/api/bills/route";
import { POST as createSummaryRoute } from "@/app/api/bills/summary/route";
import { POST as createDirectRoute } from "@/app/api/bills/direct/route";
import { DELETE as deleteBillRoute, GET as getBillRoute, PATCH as patchBillRoute } from "@/app/api/bills/[id]/route";
import { POST as addPaymentRoute } from "@/app/api/bills/[id]/payments/route";
import { DELETE as deletePaymentRoute, PATCH as patchPaymentRoute } from "@/app/api/bills/[id]/payments/[paymentId]/route";
import { GET as exportBillRoute } from "@/app/api/bills/[id]/export/route";
import {
  addPayment,
  countBillsByType,
  createBill,
  createDirectBill,
  createSummaryBill,
  deleteBill,
  deletePayment,
  getBillDetail,
  listAllBills,
  listBills,
  updateBill,
  updatePayment,
} from "@/lib/services/bills";
import { updateBillSchema } from "@/lib/validation/bill";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { actAs } from "./session-mock";
import { body, ctx, req, type ErrorBody } from "./route-helpers";
import { billInput, directInput, failed, makeSessions, ok, summaryInput } from "./helpers";

vi.mock("@/lib/session", () => import("./session-mock"));

/**
 * Tenant isolation: business B can never read, edit, delete, pay or bill
 * against business A's records - through the services OR the routes - and
 * nothing of A changes when B tries.
 */

let a: TestTenant; // the victim
let b: TestTenant; // the attacker
let billId: string;
let paymentId: string;
let sessionId: string;
let itemId: string;

beforeAll(async () => {
  [a, b] = await Promise.all([createTenant("iso-a"), createTenant("iso-b")]);
  const [session] = await makeSessions(a, [8]);
  sessionId = session.id;
  const created = ok(await createBill(a.businessId, a.actor, billInput(a, [session.id], { ratePerHour: 1000 })));
  billId = created.bill.id;
  const paid = ok(await addPayment(a.businessId, a.actor, { billId, amount: 1000, date: "2026-10-03" }));
  paymentId = paid.payment.id;
  itemId = (await db.billItem.findFirstOrThrow({ where: { billId } })).id;
});

afterAll(async () => {
  await Promise.all([cleanupTenant(a.businessId), cleanupTenant(b.businessId)]);
  await db.$disconnect();
});

/** Everything about A's bill that an attack could change. */
async function snapshotOfA() {
  const bill = await db.bill.findUniqueOrThrow({ where: { id: billId }, include: { items: true, payments: true } });
  return JSON.stringify({
    version: bill.version,
    billNumber: bill.billNumber,
    customerId: bill.customerId,
    total: bill.totalAmount.toString(),
    paid: bill.paidAmount.toString(),
    status: bill.status,
    items: bill.items.map((i) => [i.id, i.amount.toString(), i.workSessionId]),
    payments: bill.payments.map((p) => [p.id, p.amount.toString(), p.version]),
  });
}

describe("services", () => {
  it("B cannot read A's bill, and does not see it in lists or counts", async () => {
    expect(await getBillDetail(b.businessId, billId)).toBeNull();
    expect((await listBills(b.businessId)).items).toHaveLength(0);
    expect(await listAllBills(b.businessId)).toHaveLength(0);
    expect(await countBillsByType(b.businessId)).toEqual({ all: 0, app: 0, self: 0 });
    // A sees it.
    expect(await getBillDetail(a.businessId, billId)).not.toBeNull();
  });

  it("B cannot update, delete or pay A's bill, nor edit/delete A's payment", async () => {
    const before = await snapshotOfA();

    const update = updateBillSchema.parse({
      customerId: b.customerId,
      billDate: "2026-10-05",
      billNumber: "HACK-1",
      billType: "NON_GST",
      items: [{ id: itemId, excavatorId: b.excavatorId, siteName: "x", fromDate: "2026-10-01", toDate: "2026-10-01", hours: 1, ratePerHour: 1 }],
    });
    expect(failed(await updateBill(b.businessId, b.actor, billId, update)).code).toBe("NOT_FOUND");
    expect(failed(await deleteBill(b.businessId, b.actor, billId)).code).toBe("NOT_FOUND");
    expect(failed(await addPayment(b.businessId, b.actor, { billId, amount: 1, date: "2026-10-03" })).code).toBe("NOT_FOUND");
    expect(failed(await updatePayment(b.businessId, b.actor, { billId, paymentId, amount: 5, date: "2026-10-03" })).code).toBe("NOT_FOUND");
    expect(failed(await deletePayment(b.businessId, b.actor, billId, paymentId)).code).toBe("NOT_FOUND");

    expect(await snapshotOfA()).toBe(before);
    // ...and B's attempts left no audit trail on A.
    expect(await db.auditLog.count({ where: { businessId: b.businessId } })).toBe(0);
  });

  it("B cannot bill A's work sessions, even with B's own customer", async () => {
    const f = failed(await createBill(b.businessId, b.actor, billInput(b, [sessionId])));
    expect(f.code).toBe("CONFLICT");
    expect(await db.billItem.count({ where: { workSessionId: sessionId } })).toBe(1);
    expect(await db.bill.count({ where: { businessId: b.businessId } })).toBe(0);
  });

  it("B cannot create bills for A's customer or machine", async () => {
    expect(failed(await createSummaryBill(b.businessId, b.actor, summaryInput(b, { customerId: a.customerId }))).code).toBe("NOT_FOUND");
    expect(
      failed(
        await createSummaryBill(
          b.businessId,
          b.actor,
          summaryInput(b, { items: [{ excavatorId: a.excavatorId, siteName: "x", fromDate: "2026-10-01", toDate: "2026-10-01", hours: 1, ratePerHour: 1 }] }),
        ),
      ).code,
    ).toBe("NOT_FOUND");
    expect(failed(await createDirectBill(b.businessId, b.actor, directInput(b, { customerId: a.customerId }))).code).toBe("NOT_FOUND");
    expect(failed(await createDirectBill(b.businessId, b.actor, directInput(b, { excavatorId: a.excavatorId }))).code).toBe("NOT_FOUND");
    expect(await db.bill.count({ where: { businessId: b.businessId } })).toBe(0);
  });

  it("a bank account of another business is never attached to a bill", async () => {
    const foreignBank = await db.bankAccount.create({
      data: { businessId: a.businessId, label: "A bank", accountHolderName: "A", accountNumber: "111", ifsc: "TEST0000001", bankName: "Test Bank" },
    });
    const { bill } = ok(await createSummaryBill(b.businessId, b.actor, summaryInput(b, { bankAccountId: foreignBank.id })));
    expect(bill.bankAccountId).toBeNull();
    const letterhead = bill.letterhead as { bankAccount: unknown };
    expect(letterhead.bankAccount).toBeNull();
  });
});

describe("routes", () => {
  it("B gets 404 on every endpoint that addresses A's bill or payment, and A's data is untouched", async () => {
    const before = await snapshotOfA();
    actAs(b);

    const responses = await Promise.all([
      getBillRoute(req("GET", `/api/bills/${billId}`), ctx({ id: billId })),
      exportBillRoute(req("GET", `/api/bills/${billId}/export`), ctx({ id: billId })),
      deleteBillRoute(req("DELETE", `/api/bills/${billId}`), ctx({ id: billId })),
      patchBillRoute(
        req("PATCH", `/api/bills/${billId}`, {
          body: {
            customerId: b.customerId,
            billDate: "2026-10-05",
            billNumber: "HACK-2",
            billType: "NON_GST",
            items: [{ id: itemId, excavatorId: b.excavatorId, siteName: "x", fromDate: "2026-10-01", toDate: "2026-10-01", hours: 1, ratePerHour: 1 }],
          },
        }),
        ctx({ id: billId }),
      ),
      addPaymentRoute(req("POST", `/api/bills/${billId}/payments`, { body: { amount: 1, date: "2026-10-03" } }), ctx({ id: billId })),
      patchPaymentRoute(
        req("PATCH", `/api/bills/${billId}/payments/${paymentId}`, { body: { amount: 5, date: "2026-10-03" } }),
        ctx({ id: billId, paymentId }),
      ),
      deletePaymentRoute(req("DELETE", `/api/bills/${billId}/payments/${paymentId}`), ctx({ id: billId, paymentId })),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect((await body<ErrorBody>(res)).code).toBe("NOT_FOUND");
    }
    expect(await snapshotOfA()).toBe(before);
  });

  it("B's list is empty, and B cannot create on A's customer / sessions", async () => {
    actAs(b);
    const list = await listBillsRoute(req("GET", "/api/bills"), undefined);
    expect((await body<{ bills: unknown[] }>(list)).bills.filter((x) => (x as { id: string }).id === billId)).toHaveLength(0);

    const billA = await createBillRoute(req("POST", "/api/bills", { body: billInput(b, [sessionId]) }), undefined);
    expect(billA.status).toBe(409);
    const summary = await createSummaryRoute(req("POST", "/api/bills/summary", { body: summaryInput(b, { customerId: a.customerId }) }), undefined);
    expect(summary.status).toBe(404);
    const direct = await createDirectRoute(req("POST", "/api/bills/direct", { body: directInput(b, { excavatorId: a.excavatorId }) }), undefined);
    expect(direct.status).toBe(404);
  });

  it("A can still use the same endpoints on its own bill", async () => {
    actAs(a);
    const res = await getBillRoute(req("GET", `/api/bills/${billId}`), ctx({ id: billId }));
    expect(res.status).toBe(200);
    expect((await body<{ bill: { id: string } }>(res)).bill.id).toBe(billId);
  });

  it("an idempotency key cannot be used to read another business's response", async () => {
    // A creates with key K; B sends the same K with the same body shape: B gets its own, independent result.
    const key = `iso-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    actAs(a);
    const mine = await createSummaryRoute(req("POST", "/api/bills/summary", { body: summaryInput(a), headers: { "idempotency-key": key } }), undefined);
    actAs(b);
    const theirs = await createSummaryRoute(req("POST", "/api/bills/summary", { body: summaryInput(b), headers: { "idempotency-key": key } }), undefined);
    expect(mine.status).toBe(201);
    expect(theirs.status).toBe(201);
    expect(theirs.headers.get("Idempotent-Replay")).toBeNull();
    const aBill = (await body<{ bill: { id: string; businessId: string } }>(mine)).bill;
    const bBill = (await body<{ bill: { id: string; businessId: string } }>(theirs)).bill;
    expect(aBill.businessId).toBe(a.businessId);
    expect(bBill.businessId).toBe(b.businessId);
  });
});
