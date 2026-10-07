import "./pool";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { GET as listBillsRoute, POST as createBillRoute } from "@/app/api/bills/route";
import { POST as createSummaryRoute } from "@/app/api/bills/summary/route";
import { POST as createDirectRoute } from "@/app/api/bills/direct/route";
import { DELETE as deleteBillRoute, GET as getBillRoute, PATCH as patchBillRoute } from "@/app/api/bills/[id]/route";
import { POST as addPaymentRoute } from "@/app/api/bills/[id]/payments/route";
import { DELETE as deletePaymentRoute, PATCH as patchPaymentRoute } from "@/app/api/bills/[id]/payments/[paymentId]/route";
import { GET as exportBillRoute } from "@/app/api/bills/[id]/export/route";
import { GET as exportRegisterRoute } from "@/app/api/bills/export/route";
import { GET as newBillFormRoute } from "@/app/api/bills/new/route";
import { createDirectBill, createSummaryBill, listUnbilledWorkSessions } from "@/lib/services/bills";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { actAs } from "./session-mock";
import { body, ctx, req, type ErrorBody } from "./route-helpers";
import { billInput, directInput, idempotencyKey, makeSessions, summaryInput } from "./helpers";

vi.mock("@/lib/session", () => import("./session-mock"));

/**
 * The real route handlers (withApi + requireBusinessApi + parseBody +
 * runIdempotent + services), called with Request objects; only the NextAuth
 * session lookup is replaced. Checks the HTTP contract: status codes,
 * `{ error, code }` with `error` a string, response shapes the installed
 * Android apps rely on, pagination, binary exports.
 */

let t: TestTenant;

beforeAll(async () => {
  t = await createTenant("bill-routes");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await db.$disconnect();
});

beforeEach(() => actAs(t));

type BillBody = { bill: { id: string; billNumber: string; totalAmount: number; version: number; status: string } };

async function postSummary(over: Parameters<typeof summaryInput>[1] = {}, key = idempotencyKey()) {
  const res = await createSummaryRoute(
    req("POST", "/api/bills/summary", { body: summaryInput(t, over), headers: { "idempotency-key": key } }),
    undefined,
  );
  expect(res.status).toBe(201);
  return (await body<BillBody>(res)).bill;
}

describe("authentication and the error contract", () => {
  it("401 UNAUTHORIZED (string error + code) without a session, for every verb", async () => {
    actAs(null);
    const responses = await Promise.all([
      listBillsRoute(req("GET", "/api/bills"), undefined),
      createBillRoute(req("POST", "/api/bills", { body: {} }), undefined),
      getBillRoute(req("GET", "/api/bills/x"), ctx({ id: "x" })),
      deleteBillRoute(req("DELETE", "/api/bills/x"), ctx({ id: "x" })),
      addPaymentRoute(req("POST", "/api/bills/x/payments", { body: {} }), ctx({ id: "x" })),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(401);
      const err = await body<ErrorBody>(res);
      expect(err.code).toBe("UNAUTHORIZED");
      expect(typeof err.error).toBe("string");
    }
  });

  it("423 ACCOUNT_FROZEN for a frozen business", async () => {
    actAs(t, { frozen: true });
    const res = await listBillsRoute(req("GET", "/api/bills"), undefined);
    expect(res.status).toBe(423);
    expect((await body<ErrorBody>(res)).code).toBe("ACCOUNT_FROZEN");
  });

  it("422 VALIDATION_FAILED with a readable string message for a bad body", async () => {
    const res = await createBillRoute(req("POST", "/api/bills", { body: { ...billInput(t, ["x"]), workSessionIds: [] } }), undefined);
    expect(res.status).toBe(422);
    const err = await body<ErrorBody>(res);
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.error).toBe("Select at least one work record");
    expect(err.requestId).toBeTruthy();
    expect(res.headers.get("x-request-id")).toBe(err.requestId);
  });

  it("400 BAD_REQUEST for malformed JSON", async () => {
    const res = await createSummaryRoute(req("POST", "/api/bills/summary", { rawBody: "{not json" }), undefined);
    expect(res.status).toBe(400);
    expect((await body<ErrorBody>(res)).code).toBe("BAD_REQUEST");
  });

  it("422 for an amount above the column range instead of a database overflow (500)", async () => {
    const res = await createSummaryRoute(
      req("POST", "/api/bills/summary", {
        body: {
          ...summaryInput(t),
          items: [{ excavatorId: t.excavatorId, siteName: "S", fromDate: "2026-10-01", toDate: "2026-10-01", hours: 1, ratePerHour: 1e12 }],
        },
      }),
      undefined,
    );
    expect(res.status).toBe(422);
  });
});

describe("creating bills over HTTP", () => {
  it("POST /api/bills -> 201 { bill }, replays on the same Idempotency-Key, and audits with the request id", async () => {
    const [s1] = await makeSessions(t, [8]);
    const key = idempotencyKey();
    const make = () => createBillRoute(req("POST", "/api/bills", { body: billInput(t, [s1.id]), headers: { "idempotency-key": key } }), undefined);

    const first = await make();
    expect(first.status).toBe(201);
    const created = await body<BillBody>(first);
    expect(created.bill.totalAmount).toBe(8000);
    expect(typeof created.bill.totalAmount).toBe("number");

    const replay = await make();
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotent-Replay")).toBe("true");
    expect((await body<BillBody>(replay)).bill.id).toBe(created.bill.id);
    expect(await db.bill.count({ where: { businessId: t.businessId, items: { some: { workSessionId: s1.id } } } })).toBe(1);

    const audit = await db.auditLog.findFirstOrThrow({ where: { businessId: t.businessId, entityId: created.bill.id, action: "bill.create" } });
    expect(audit.requestId).toBe(first.headers.get("x-request-id"));
  });

  it("POST /api/bills: the same work again is 409 WORK_SESSION_ALREADY_BILLED", async () => {
    const [s1] = await makeSessions(t, [8]);
    const post = () => createBillRoute(req("POST", "/api/bills", { body: billInput(t, [s1.id]) }), undefined);
    expect((await post()).status).toBe(201);
    const res = await post();
    expect(res.status).toBe(409);
    const err = await body<ErrorBody>(res);
    expect(err.code).toBe("WORK_SESSION_ALREADY_BILLED");
    expect(typeof err.error).toBe("string");
  });

  it("POST /api/bills/summary and /api/bills/direct -> 201 with { bill }", async () => {
    const summary = await postSummary();
    expect(summary.totalAmount).toBe(10000);
    const res = await createDirectRoute(req("POST", "/api/bills/direct", { body: directInput(t), headers: { "idempotency-key": idempotencyKey() } }), undefined);
    expect(res.status).toBe(201);
    expect((await body<BillBody>(res)).bill.totalAmount).toBe(10000);
  });

  it("an Idempotency-Key reused with a different body is 409 IDEMPOTENCY_KEY_REUSED", async () => {
    const key = idempotencyKey();
    await postSummary({}, key);
    const res = await createSummaryRoute(
      req("POST", "/api/bills/summary", { body: summaryInput(t, { notes: "different" }), headers: { "idempotency-key": key } }),
      undefined,
    );
    expect(res.status).toBe(409);
    expect((await body<ErrorBody>(res)).code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});

describe("bill detail, update and delete over HTTP", () => {
  it("GET /api/bills/[id] -> { bill, previewData } with money as plain numbers", async () => {
    const created = await postSummary();
    const res = await getBillRoute(req("GET", `/api/bills/${created.id}`), ctx({ id: created.id }));
    expect(res.status).toBe(200);
    const data = await body<{ bill: { id: string; version: number; totalAmount: number; items: { amount: number }[]; payments: unknown[] }; previewData: { totalAmount: number; items: { amount: number }[] } }>(res);
    expect(data.bill.id).toBe(created.id);
    expect(data.bill.version).toBe(0);
    expect(data.bill.totalAmount).toBe(10000);
    expect(data.bill.items[0].amount).toBe(10000);
    expect(data.previewData.totalAmount).toBe(10000);
    expect(data.previewData.items[0].amount).toBe(10000);
  });

  it("GET /api/bills/[id] -> 404 NOT_FOUND for an unknown id", async () => {
    const res = await getBillRoute(req("GET", "/api/bills/nope"), ctx({ id: "nope" }));
    expect(res.status).toBe(404);
    expect((await body<ErrorBody>(res)).code).toBe("NOT_FOUND");
  });

  it("PATCH: 200 { id, version }, then 409 RESOURCE_MODIFIED for the stale version; 422 for a bad body", async () => {
    const created = await postSummary();
    const item = await db.billItem.findFirstOrThrow({ where: { billId: created.id } });
    const patch = (expectedVersion: number | undefined, hours = 5) =>
      patchBillRoute(
        req("PATCH", `/api/bills/${created.id}`, {
          body: {
            customerId: t.customerId,
            billDate: "2026-10-05",
            billNumber: created.billNumber,
            billType: "NON_GST",
            ...(expectedVersion === undefined ? {} : { expectedVersion }),
            items: [{ id: item.id, excavatorId: t.excavatorId, siteName: "S", fromDate: "2026-10-01", toDate: "2026-10-01", hours, ratePerHour: 1000 }],
          },
        }),
        ctx({ id: created.id }),
      );

    const ok = await patch(0);
    expect(ok.status).toBe(200);
    expect(await body(ok)).toEqual({ id: created.id, version: 1 });

    const stale = await patch(0, 6);
    expect(stale.status).toBe(409);
    const err = await body<ErrorBody>(stale);
    expect(err.code).toBe("RESOURCE_MODIFIED");
    expect(typeof err.error).toBe("string");

    const bad = await patchBillRoute(req("PATCH", `/api/bills/${created.id}`, { body: { customerId: "" } }), ctx({ id: created.id }));
    expect(bad.status).toBe(422);
  });

  it("DELETE honours ?expectedVersion= (409 stale, 400 malformed) and deletes otherwise", async () => {
    const created = await postSummary();
    const del = (query: string) => deleteBillRoute(req("DELETE", `/api/bills/${created.id}${query}`), ctx({ id: created.id }));

    expect((await del("?expectedVersion=abc")).status).toBe(400);
    const stale = await del("?expectedVersion=5");
    expect(stale.status).toBe(409);
    expect((await body<ErrorBody>(stale)).code).toBe("RESOURCE_MODIFIED");
    expect(await db.bill.count({ where: { id: created.id } })).toBe(1);

    const ok = await del("?expectedVersion=0");
    expect(ok.status).toBe(200);
    expect(await body(ok)).toEqual({ success: true });
    expect(await db.bill.count({ where: { id: created.id } })).toBe(0);

    // Older apps send no version at all.
    const legacy = await postSummary();
    const res = await deleteBillRoute(req("DELETE", `/api/bills/${legacy.id}`), ctx({ id: legacy.id }));
    expect(res.status).toBe(200);
  });
});

describe("payments over HTTP", () => {
  it("POST 201 { success, payment, bill }; replay by key; overpayment 409; zero 422", async () => {
    const created = await postSummary(); // 10000
    const key = idempotencyKey();
    const pay = (amount: number, k?: string) =>
      addPaymentRoute(
        req("POST", `/api/bills/${created.id}/payments`, { body: { amount, date: "2026-10-03", method: "UPI" }, headers: k ? { "idempotency-key": k } : {} }),
        ctx({ id: created.id }),
      );

    const first = await pay(4000, key);
    expect(first.status).toBe(201);
    const data = await body<{ success: boolean; payment: { id: string; amount: number; version: number }; bill: { paidAmount: number; status: string; version: number } }>(first);
    expect(data.success).toBe(true);
    expect(data.payment.amount).toBe(4000);
    expect(data.bill).toMatchObject({ paidAmount: 4000, status: "PARTIAL", version: 1 });

    const replay = await pay(4000, key);
    expect((await body<{ payment: { id: string } }>(replay)).payment.id).toBe(data.payment.id);
    expect(await db.payment.count({ where: { billId: created.id } })).toBe(1);

    const over = await pay(6000.01);
    expect(over.status).toBe(409);
    expect((await body<ErrorBody>(over)).code).toBe("PAYMENT_EXCEEDS_BALANCE");

    expect((await pay(0)).status).toBe(422);
    expect((await pay(6000)).status).toBe(201);
    expect((await db.bill.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("PAID");
  });

  it("PATCH / DELETE a payment with expectedVersion", async () => {
    const created = await postSummary();
    const added = await addPaymentRoute(
      req("POST", `/api/bills/${created.id}/payments`, { body: { amount: 1000, date: "2026-10-03" } }),
      ctx({ id: created.id }),
    );
    const { payment } = await body<{ payment: { id: string } }>(added);
    const c = ctx({ id: created.id, paymentId: payment.id });
    const patch = (amount: number, expectedVersion: number) =>
      patchPaymentRoute(req("PATCH", `/api/bills/${created.id}/payments/${payment.id}`, { body: { amount, date: "2026-10-04", expectedVersion } }), c);

    expect((await patch(1500, 0)).status).toBe(200);
    const stale = await patch(1600, 0);
    expect(stale.status).toBe(409);
    expect((await body<ErrorBody>(stale)).code).toBe("RESOURCE_MODIFIED");
    const tooMuch = await patch(10_000.01, 1);
    expect(tooMuch.status).toBe(409);
    expect((await body<ErrorBody>(tooMuch)).code).toBe("PAYMENT_EXCEEDS_BALANCE");

    const staleDelete = await deletePaymentRoute(req("DELETE", `/api/bills/${created.id}/payments/${payment.id}?expectedVersion=0`), c);
    expect(staleDelete.status).toBe(409);
    const del = await deletePaymentRoute(req("DELETE", `/api/bills/${created.id}/payments/${payment.id}?expectedVersion=1`), c);
    expect(del.status).toBe(200);
    expect((await db.bill.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("UNPAID");
  });
});

describe("GET /api/bills pagination", () => {
  let p: TestTenant;

  beforeAll(async () => {
    p = await createTenant("bill-pagination");
    // Five bills; two pairs share a billDate so the id tie-breaker matters.
    const dates = ["2026-09-01", "2026-09-02", "2026-09-02", "2026-09-03", "2026-09-03"];
    for (const [i, billDate] of dates.entries()) {
      const result = await createSummaryBill(p.businessId, p.actor, summaryInput(p, { billDate, billNumber: `PG-${i}` }));
      if ("error" in result) throw new Error(result.error);
    }
    const direct = await createDirectBill(p.businessId, p.actor, directInput(p, { billDate: "2026-08-01", billNumber: "PG-D" }));
    if ("error" in direct) throw new Error(direct.error);
  });

  afterAll(async () => {
    await cleanupTenant(p.businessId);
  });

  type Page = { bills: { id: string; billDate: string; isDirect: boolean }[]; counts: { all: number; app: number; self: number }; nextCursor: string | null };

  const page = async (query: string) => {
    actAs(p);
    const res = await listBillsRoute(req("GET", `/api/bills${query}`), undefined);
    expect(res.status).toBe(200);
    return body<Page>(res);
  };

  it("without limit (old apps) returns every bill under the existing keys, nextCursor null", async () => {
    const all = await page("");
    expect(Object.keys(all).sort()).toEqual(["bills", "counts", "nextCursor"]);
    expect(all.bills).toHaveLength(6);
    expect(all.nextCursor).toBeNull();
    expect(all.counts).toEqual({ all: 6, app: 5, self: 1 });
  });

  it("walks the list page by page in a stable order (billDate desc, id desc) with no overlap or gaps", async () => {
    const expected = (await db.bill.findMany({ where: { businessId: p.businessId }, orderBy: [{ billDate: "desc" }, { id: "desc" }], select: { id: true } })).map((b) => b.id);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const data: Page = await page(`?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      expect(data.bills.length).toBeLessThanOrEqual(2);
      expect(data.counts.all).toBe(6); // counts describe the whole list, not the page
      seen.push(...data.bills.map((b) => b.id));
      cursor = data.nextCursor;
      pages++;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(6);
  });

  it("a page that ends exactly at the last row has no nextCursor", async () => {
    const data = await page("?limit=6");
    expect(data.bills).toHaveLength(6);
    expect(data.nextCursor).toBeNull();
  });

  it("filter=app / filter=self and customerId narrow the list", async () => {
    expect((await page("?filter=self")).bills).toHaveLength(1);
    expect((await page("?filter=app")).bills).toHaveLength(5);
    expect((await page(`?customerId=${p.customerId}&limit=3`)).bills).toHaveLength(3);
    expect((await page("?customerId=someone-else")).bills).toHaveLength(0);
  });

  it("rejects a bad limit with 400 and clamps an oversized one", async () => {
    actAs(p);
    for (const q of ["?limit=0", "?limit=abc", "?limit=-3", "?limit=1.5"]) {
      const res = await listBillsRoute(req("GET", `/api/bills${q}`), undefined);
      expect(res.status).toBe(400);
      expect((await body<ErrorBody>(res)).code).toBe("BAD_REQUEST");
    }
    expect((await page("?limit=100000")).bills).toHaveLength(6);
  });
});

describe("unbilled work list is bounded", () => {
  it("never returns more than 500 rows", async () => {
    const big = await createTenant("bill-unbilled-cap");
    try {
      const data = Array.from({ length: 505 }, (_, i) => ({
        businessId: big.businessId,
        excavatorId: big.excavatorId,
        customerId: big.customerId,
        siteId: big.siteId,
        operatorId: big.operatorId,
        startDate: new Date(Date.UTC(2026, 0, 1 + (i % 28))),
        endDate: new Date(Date.UTC(2026, 0, 1 + (i % 28))),
        startHourMeter: 0,
        endHourMeter: 1,
        totalHours: 1,
        status: "COMPLETED",
      }));
      await db.workSession.createMany({ data });

      const rows = await listUnbilledWorkSessions(big.businessId, big.customerId);
      expect(rows).toHaveLength(500);

      actAs(big);
      const res = await newBillFormRoute(req("GET", `/api/bills/new?customerId=${big.customerId}`), undefined);
      expect(res.status).toBe(200);
      const form = await body<{ sessions: { id: string; totalHours: number }[] }>(res);
      expect(form.sessions).toHaveLength(500);
      expect(form.sessions[0].totalHours).toBe(1);
    } finally {
      await cleanupTenant(big.businessId);
      actAs(t);
    }
  });
});

describe("exports (binary responses)", () => {
  it("GET /api/bills/[id]/export returns an .xlsx workbook", async () => {
    const created = await postSummary({ billType: "GST", gstPercentage: 18, billNumber: "GST/EXP 1" });
    const res = await exportBillRoute(req("GET", `/api/bills/${created.id}/export`), ctx({ id: created.id }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="bill-GST-EXP-1.xlsx"');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK"); // zip container
    expect(bytes.length).toBeGreaterThan(2000);
  });

  it("GET /api/bills/export returns the bills register workbook", async () => {
    await postSummary();
    const res = await exportRegisterRoute(req("GET", "/api/bills/export"), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="bills-register-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });

  it("an export for an unknown bill is a JSON 404", async () => {
    const res = await exportBillRoute(req("GET", "/api/bills/nope/export"), ctx({ id: "nope" }));
    expect(res.status).toBe(404);
    expect((await body<ErrorBody>(res)).code).toBe("NOT_FOUND");
  });
});
