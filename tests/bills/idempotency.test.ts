import "./pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { runIdempotent } from "@/lib/idempotency";
import { withApi } from "@/lib/with-api";
import { addPayment, createBill, createDirectBill, createSummaryBill } from "@/lib/services/bills";
import type { GenerateBillInput } from "@/lib/validation/bill";
import { cleanupTenant, createTenant, fakeRequest, type TestTenant } from "../helpers/tenant";
import { billInput, directInput, idempotencyKey, makeSessions, summaryInput, uniq } from "./helpers";

/**
 * Exactly-once creates. These drive runIdempotent() with real Request objects
 * the way the POST routes do (same operation names, same work functions), so
 * what is tested is the contract a retrying client relies on.
 */

let t: TestTenant;

beforeAll(async () => {
  t = await createTenant("bill-idempotency");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await db.$disconnect();
});

/** What a POST route does: runIdempotent inside withApi, so a thrown ApiHttpError
 * (IDEMPOTENCY_KEY_REUSED, a malformed key...) becomes the standard error response. */
function viaRoute(
  req: Request,
  opts: Omit<Parameters<typeof runIdempotent>[0], "req">,
  work: Parameters<typeof runIdempotent>[1],
) {
  return withApi("test.idempotent", async () => runIdempotent({ ...opts, req }, work))(req, undefined);
}

const headers = (key?: string): Record<string, string> => (key ? { "idempotency-key": key } : {});

function postBill(input: GenerateBillInput, key?: string, tenant: TestTenant = t) {
  const req = fakeRequest("https://app.example.test/api/bills", { headers: headers(key), body: input });
  return viaRoute(
    req,
    { businessId: tenant.businessId, actorId: tenant.actor.id, operation: "bill.create", payload: input },
    async (tx) => {
      const result = await createBill(tenant.businessId, tenant.actor, input, { tx });
      if ("error" in result) return { ok: false, failure: result };
      return { ok: true, status: 201, body: result, resourceType: "Bill", resourceId: result.bill.id };
    },
  );
}

function postSummary(input: ReturnType<typeof summaryInput>, key?: string) {
  const req = fakeRequest("https://app.example.test/api/bills/summary", { headers: headers(key), body: input });
  return viaRoute(
    req,
    { businessId: t.businessId, actorId: t.actor.id, operation: "bill.summary.create", payload: input },
    async (tx) => {
      const result = await createSummaryBill(t.businessId, t.actor, input, { tx });
      if ("error" in result) return { ok: false, failure: result };
      return { ok: true, status: 201, body: result, resourceType: "Bill", resourceId: result.bill.id };
    },
  );
}

function postDirect(input: ReturnType<typeof directInput>, key?: string) {
  const req = fakeRequest("https://app.example.test/api/bills/direct", { headers: headers(key), body: input });
  return viaRoute(
    req,
    { businessId: t.businessId, actorId: t.actor.id, operation: "bill.direct.create", payload: input },
    async (tx) => {
      const result = await createDirectBill(t.businessId, t.actor, input, { tx });
      if ("error" in result) return { ok: false, failure: result };
      return { ok: true, status: 201, body: result, resourceType: "Bill", resourceId: result.bill.id };
    },
  );
}

function postPayment(billId: string, amount: number, key?: string) {
  const input = { billId, amount, date: "2026-10-03" };
  const req = fakeRequest(`https://app.example.test/api/bills/${billId}/payments`, { headers: headers(key), body: input });
  return viaRoute(
    req,
    { businessId: t.businessId, actorId: t.actor.id, operation: "payment.create", payload: input },
    async (tx) => {
      const result = await addPayment(t.businessId, t.actor, input, { tx });
      if ("error" in result) return { ok: false, failure: result };
      return { ok: true, status: 201, body: result, resourceType: "Payment", resourceId: result.payment.id };
    },
  );
}

const billCount = () => db.bill.count({ where: { businessId: t.businessId } });

describe("bill creation is idempotent", () => {
  it("creates with 201 and the original { bill } body shape", async () => {
    const [s1] = await makeSessions(t, [8]);
    const res = await postBill(billInput(t, [s1.id]), idempotencyKey());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.bill.id).toBeTruthy();
    expect(body.bill.totalAmount).toBe(8000); // money is a plain number in JSON
    expect(res.headers.get("Idempotent-Replay")).toBeNull();

    const key = await db.idempotencyKey.findFirst({ where: { businessId: t.businessId, resourceId: body.bill.id } });
    expect(key).toMatchObject({ operation: "bill.create", resourceType: "Bill", responseStatus: 201 });
  });

  it("a retry with the same key replays the original response and creates nothing new", async () => {
    const [s1] = await makeSessions(t, [8]);
    const input = billInput(t, [s1.id]);
    const key = idempotencyKey();

    const first = await postBill(input, key);
    const firstBody = await first.json();
    const before = await billCount();

    const replay = await postBill(input, key);
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotent-Replay")).toBe("true");
    expect(await replay.json()).toEqual(firstBody);

    const replayAgain = await postBill(input, key);
    expect((await replayAgain.json()).bill.id).toBe(firstBody.bill.id);

    expect(await billCount()).toBe(before);
    expect(await db.billItem.count({ where: { workSessionId: s1.id } })).toBe(1);
  });

  it("the same key with a different payload is refused: 409 IDEMPOTENCY_KEY_REUSED", async () => {
    const [s1, s2] = await makeSessions(t, [8, 4]);
    const key = idempotencyKey();
    await postBill(billInput(t, [s1.id]), key);
    const before = await billCount();

    const res = await postBill(billInput(t, [s2.id]), key);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(await billCount()).toBe(before);
    expect(await db.billItem.count({ where: { workSessionId: s2.id } })).toBe(0);
  });

  it("the same key used for a different operation is refused as well", async () => {
    const key = idempotencyKey();
    await postSummary(summaryInput(t), key);
    const res = await postDirect(directInput(t), key);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("parallel duplicates with one key create exactly one bill and all get the same answer", async () => {
    const [s1] = await makeSessions(t, [6]);
    const input = billInput(t, [s1.id]);
    const key = idempotencyKey();
    const before = await billCount();

    const responses = await Promise.all(Array.from({ length: 5 }, () => postBill(input, key)));
    const bodies = await Promise.all(responses.map((r) => r.json()));

    expect(responses.every((r) => r.status === 201)).toBe(true);
    expect(new Set(bodies.map((b) => b.bill.id)).size).toBe(1);
    expect(responses.filter((r) => r.headers.get("Idempotent-Replay") === "true")).toHaveLength(4);
    expect(await billCount()).toBe(before + 1);
    expect(await db.billItem.count({ where: { workSessionId: s1.id } })).toBe(1);
  });

  it("a business-rule failure is rolled back and not stored: the corrected request can reuse the key", async () => {
    const [s1, s2] = await makeSessions(t, [5, 5]);
    expectCreated(await postBill(billInput(t, [s1.id]), idempotencyKey()));
    const key = idempotencyKey();

    // s1 is already billed -> WORK_SESSION_ALREADY_BILLED, nothing stored under the key
    const bad = await postBill(billInput(t, [s1.id, s2.id]), key);
    expect(bad.status).toBe(409);
    expect(await bad.json()).toMatchObject({ code: "WORK_SESSION_ALREADY_BILLED" });
    expect(await db.idempotencyKey.count({ where: { businessId: t.businessId, key } })).toBe(0);
    expect(await db.billItem.count({ where: { workSessionId: s2.id } })).toBe(0);

    const good = await postBill(billInput(t, [s2.id]), key);
    expect(good.status).toBe(201);
  });

  it("a failed attempt consumes no Non-GST bill number", async () => {
    const tenant = await createTenant("bill-idem-seq");
    try {
      const [s1, s2] = await makeSessions(tenant, [1, 1]);
      expectCreated(await postBill(billInput(tenant, [s1.id]), idempotencyKey(), tenant)); // NG-0001
      const bad = await postBill(billInput(tenant, [s1.id]), idempotencyKey(), tenant);
      expect(bad.status).toBe(409);
      const next = await postBill(billInput(tenant, [s2.id]), idempotencyKey(), tenant);
      expect((await next.json()).bill.billNumber).toBe("NG-0002");
    } finally {
      await cleanupTenant(tenant.businessId);
    }
  });

  it("without a key it still works (older apps) but is not replay-protected", async () => {
    const [s1, s2] = await makeSessions(t, [2, 2]);
    expect((await postBill(billInput(t, [s1.id]))).status).toBe(201);
    expect((await postBill(billInput(t, [s2.id]))).status).toBe(201);
  });

  it("keys are scoped to the business: the same key in another tenant is an independent request", async () => {
    const other = await createTenant("bill-idem-other");
    try {
      const key = idempotencyKey();
      const [mine] = await makeSessions(t, [1]);
      const [theirs] = await makeSessions(other, [1]);
      const a = await postBill(billInput(t, [mine.id]), key);
      const b = await postBill(billInput(other, [theirs.id]), key, other);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect((await a.json()).bill.id).not.toBe((await b.json()).bill.id);
    } finally {
      await cleanupTenant(other.businessId);
    }
  });

  it("rejects a malformed key with 400 BAD_REQUEST before doing anything", async () => {
    const [s1] = await makeSessions(t, [1]);
    const res = await postBill(billInput(t, [s1.id]), "short");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "BAD_REQUEST" });
    expect(await db.billItem.count({ where: { workSessionId: s1.id } })).toBe(0);
  });
});

describe("summary and direct bill creation are idempotent", () => {
  it("summary bill: replay returns the same bill, one row", async () => {
    const input = summaryInput(t);
    const key = idempotencyKey();
    const before = await billCount();
    const first = await postSummary(input, key);
    const second = await postSummary(input, key);
    expect(first.status).toBe(201);
    expect((await second.json()).bill.id).toBe((await first.json()).bill.id);
    expect(await billCount()).toBe(before + 1);
  });

  it("direct bill: parallel duplicates create one bill", async () => {
    const input = directInput(t, { billNumber: `DIR-${uniq()}` });
    const key = idempotencyKey();
    const before = await billCount();
    const responses = await Promise.all(Array.from({ length: 4 }, () => postDirect(input, key)));
    const ids = await Promise.all(responses.map(async (r) => (await r.json()).bill.id as string));
    expect(new Set(ids).size).toBe(1);
    expect(await billCount()).toBe(before + 1);
  });
});

describe("payment creation is idempotent", () => {
  it("a replayed payment returns the same payment and records the money once", async () => {
    const { bill } = (await (await postSummary(summaryInput(t), idempotencyKey())).json()) as { bill: { id: string } };
    const key = idempotencyKey();

    const first = await postPayment(bill.id, 4000, key);
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.success).toBe(true);
    expect(firstBody.bill.paidAmount).toBe(4000);

    const replay = await postPayment(bill.id, 4000, key);
    expect(replay.headers.get("Idempotent-Replay")).toBe("true");
    expect((await replay.json()).payment.id).toBe(firstBody.payment.id);

    expect(await db.payment.count({ where: { billId: bill.id } })).toBe(1);
    const row = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(row.paidAmount.toString()).toBe("4000");
  });

  it("the same key with another amount is refused (409 IDEMPOTENCY_KEY_REUSED), money not recorded", async () => {
    const { bill } = (await (await postSummary(summaryInput(t), idempotencyKey())).json()) as { bill: { id: string } };
    const key = idempotencyKey();
    await postPayment(bill.id, 100, key);
    const res = await postPayment(bill.id, 200, key);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(await db.payment.count({ where: { billId: bill.id } })).toBe(1);
  });

  it("parallel duplicates of a payment record it once (a double tap on Save)", async () => {
    const { bill } = (await (await postSummary(summaryInput(t), idempotencyKey())).json()) as { bill: { id: string } };
    const key = idempotencyKey();
    const responses = await Promise.all(Array.from({ length: 5 }, () => postPayment(bill.id, 1000, key)));
    expect(responses.every((r) => r.status === 201)).toBe(true);
    expect(await db.payment.count({ where: { billId: bill.id } })).toBe(1);
    const row = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(row.paidAmount.toString()).toBe("1000");
  });

  it("an overpayment is a 409 PAYMENT_EXCEEDS_BALANCE with nothing stored under the key", async () => {
    const { bill } = (await (await postSummary(summaryInput(t), idempotencyKey())).json()) as { bill: { id: string } };
    const key = idempotencyKey();
    const res = await postPayment(bill.id, 10_000.01, key);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "PAYMENT_EXCEEDS_BALANCE" });
    expect(await db.idempotencyKey.count({ where: { businessId: t.businessId, key } })).toBe(0);
    expect(await db.payment.count({ where: { billId: bill.id } })).toBe(0);
  });
});

/** Asserts a runIdempotent response was a 201 (and returns its status). */
function expectCreated(res: Response) {
  expect(res.status).toBe(201);
  return res;
}

describe("idempotency housekeeping", () => {
  it("an EXPIRED key is treated as absent (the same key can be used again) and the replay copy omits the heavy letterhead", async () => {
    const { runIdempotent } = await import("@/lib/idempotency");
    const { db } = await import("@/lib/db");
    const { createTenant, cleanupTenant } = await import("../helpers/tenant");
    const t = await createTenant("idem-expiry");
    try {
      const key = `expiry-key-${Math.random().toString(36).slice(2, 10)}`;
      const mkReq = () => new Request("https://x.test/api/x", { method: "POST", headers: { "idempotency-key": key } });
      let runs = 0;
      const work = async () => {
        runs++;
        return { ok: true as const, status: 201, body: { bill: { id: `b${runs}`, letterhead: { logoLeftUrl: "data:image/png;base64,AAAA" } } } };
      };
      const args = { businessId: t.businessId, actorId: t.userId, operation: "bill.create", payload: { a: 1 } };

      const first = await runIdempotent({ req: mkReq(), ...args }, work);
      expect(first.status).toBe(201);
      const stored = await db.idempotencyKey.findFirstOrThrow({ where: { businessId: t.businessId, key } });
      expect(JSON.stringify(stored.responseBody)).not.toContain("letterhead");

      const replay = await runIdempotent({ req: mkReq(), ...args }, work);
      expect(replay.headers.get("Idempotent-Replay")).toBe("true");
      expect(runs).toBe(1);

      await db.idempotencyKey.update({ where: { id: stored.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
      const again = await runIdempotent({ req: mkReq(), ...args }, work);
      expect(again.headers.get("Idempotent-Replay")).toBeNull();
      expect(runs).toBe(2); // ran again: the expired row did not block or replay
    } finally {
      await cleanupTenant(t.businessId);
    }
  }, 120_000);
});
