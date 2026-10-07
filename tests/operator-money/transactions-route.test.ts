import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { cleanupTenant, createTenant, fakeRequest, type TestTenant } from "../helpers/tenant";

/**
 * The money routes end to end (withApi + parseBody + runIdempotent + services
 * + real DB). Only the session lookup is replaced: requireBusinessApi returns
 * whichever throwaway tenant the test selected, exactly as it would for a
 * signed-in owner.
 */

const auth = vi.hoisted(() => ({
  current: null as null | { businessId: string; userId: string; ownerName: string },
}));

vi.mock("@/lib/api-auth", () => ({
  requireBusinessApi: async () => {
    const s = auth.current;
    if (!s) {
      return {
        session: null,
        error: Response.json({ error: "Please log in again.", code: "UNAUTHORIZED" }, { status: 401 }),
      };
    }
    return {
      session: { ...s, businessFrozen: false },
      actor: { type: "OWNER", id: s.userId, name: s.ownerName },
      error: null,
    };
  },
}));

import { GET as getDetail } from "@/app/api/operators/detail/route";
import { GET as listTx, POST as createTx } from "@/app/api/operators/[id]/transactions/route";
import { DELETE as deleteTx, PATCH as patchTx } from "@/app/api/operators/[id]/transactions/[transactionId]/route";

let t: TestTenant;
let other: TestTenant;

const URL_BASE = "https://app.example.test";
const txUrl = (operatorId: string) => `${URL_BASE}/api/operators/${operatorId}/transactions`;
const body = (over: Record<string, unknown> = {}) => ({
  amount: 100.1,
  date: "2026-10-02",
  businessEffect: "ADVANCE_RECOVERABLE",
  deductFromSalary: true,
  ...over,
});
const keyHeader = (key: string) => ({ "idempotency-key": key });

function post(operatorId: string, payload: unknown, headers: Record<string, string> = {}) {
  return createTx(fakeRequest(txUrl(operatorId), { headers, body: payload }), { params: Promise.resolve({ id: operatorId }) });
}
function patch(operatorId: string, transactionId: string, payload: unknown) {
  return patchTx(fakeRequest(`${txUrl(operatorId)}/${transactionId}`, { method: "PATCH", body: payload }), {
    params: Promise.resolve({ id: operatorId, transactionId }),
  });
}
function remove(operatorId: string, transactionId: string) {
  return deleteTx(fakeRequest(`${txUrl(operatorId)}/${transactionId}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: operatorId, transactionId }),
  });
}

beforeAll(async () => {
  t = await createTenant("optx-route");
  other = await createTenant("optx-route-other");
});

beforeEach(() => {
  auth.current = { businessId: t.businessId, userId: t.userId, ownerName: "Test Owner" };
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await cleanupTenant(other.businessId);
});

describe("POST /api/operators/[id]/transactions", () => {
  it("returns the standard 401 contract when signed out", async () => {
    auth.current = null;
    const res = await post(t.operatorId, body());
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("creates with 201, money as a plain number, and keeps the legacy { ok: true } field", async () => {
    const res = await post(t.operatorId, body({ amount: 0.3, notes: "plain" }));
    expect(res.status).toBe(201);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.transaction.amount).toBe(0.3);
    expect(typeof json.transaction.amount).toBe("number");
    expect(json.transaction.version).toBe(0);
  });

  it("Idempotency-Key: a replay returns the first response and creates ONE row and ONE audit entry", async () => {
    const key = `tx-replay-${Date.now()}-aaaa`;
    const payload = body({ amount: 123.45, notes: "idem-replay" });

    const first = await post(t.operatorId, payload, keyHeader(key));
    const second = await post(t.operatorId, payload, keyHeader(key));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.headers.get("Idempotent-Replay")).toBeNull();
    expect(second.headers.get("Idempotent-Replay")).toBe("true");

    const a = await first.json();
    const b = await second.json();
    expect(b.transaction.id).toBe(a.transaction.id);

    expect(await db.operatorTransaction.count({ where: { businessId: t.businessId, notes: "idem-replay" } })).toBe(1);
    expect(await db.auditLog.count({ where: { businessId: t.businessId, entityId: a.transaction.id, action: "operator.transaction.create" } })).toBe(1);
    const stored = await db.idempotencyKey.findUnique({ where: { businessId_key: { businessId: t.businessId, key } } });
    expect(stored).toMatchObject({ operation: "operator.transaction.create", resourceType: "OperatorTransaction", resourceId: a.transaction.id });
  });

  it("concurrent duplicates with the same key still create exactly one row", async () => {
    const key = `tx-parallel-${Date.now()}-bbbb`;
    const payload = body({ amount: 5.5, notes: "idem-parallel" });
    const results = await Promise.all([
      post(t.operatorId, payload, keyHeader(key)),
      post(t.operatorId, payload, keyHeader(key)),
      post(t.operatorId, payload, keyHeader(key)),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    const ids = new Set((await Promise.all(results.map((r) => r.json()))).map((j) => j.transaction.id));
    expect(ids.size).toBe(1);
    expect(await db.operatorTransaction.count({ where: { businessId: t.businessId, notes: "idem-parallel" } })).toBe(1);
  });

  it("the same key with a different payload is 409 IDEMPOTENCY_KEY_REUSED and creates nothing", async () => {
    const key = `tx-reused-${Date.now()}-cccc`;
    expect((await post(t.operatorId, body({ amount: 10, notes: "idem-reuse" }), keyHeader(key))).status).toBe(201);

    const res = await post(t.operatorId, body({ amount: 11, notes: "idem-reuse" }), keyHeader(key));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(typeof json.error).toBe("string");
    expect(await db.operatorTransaction.count({ where: { businessId: t.businessId, notes: "idem-reuse" } })).toBe(1);
  });

  it("without the header (older apps) each request is its own transaction", async () => {
    await post(t.operatorId, body({ notes: "no-key" }));
    await post(t.operatorId, body({ notes: "no-key" }));
    expect(await db.operatorTransaction.count({ where: { businessId: t.businessId, notes: "no-key" } })).toBe(2);
  });

  it("a malformed Idempotency-Key is 400 BAD_REQUEST", async () => {
    const res = await post(t.operatorId, body(), keyHeader("x"));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("BAD_REQUEST");
  });

  it("a failed attempt is rolled back and does not burn the key", async () => {
    const key = `tx-failed-${Date.now()}-dddd`;
    const missing = await post("no-such-operator", body(), keyHeader(key));
    expect(missing.status).toBe(404);
    expect((await missing.json()).code).toBe("NOT_FOUND");
    expect(await db.idempotencyKey.count({ where: { businessId: t.businessId, key } })).toBe(0);
  });

  it("another tenant's operator is a 404 and nothing is written", async () => {
    const res = await post(other.operatorId, body({ notes: "cross-tenant" }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe("NOT_FOUND");
    expect(typeof json.error).toBe("string");
    expect(await db.operatorTransaction.count({ where: { notes: "cross-tenant" } })).toBe(0);
  });

  it("validation failures are 422 VALIDATION_FAILED with a string message; bad JSON is 400", async () => {
    const tooPrecise = await post(t.operatorId, body({ amount: 10.123 }));
    expect(tooPrecise.status).toBe(422);
    const json = await tooPrecise.json();
    expect(json.code).toBe("VALIDATION_FAILED");
    expect(typeof json.error).toBe("string");

    const missingEffect = await post(t.operatorId, { amount: 5, date: "2026-10-02" });
    expect(missingEffect.status).toBe(422);

    const bad = await createTx(
      new Request(txUrl(t.operatorId), { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }),
      { params: Promise.resolve({ id: t.operatorId }) },
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("BAD_REQUEST");
  });

  it("the operator in the URL wins over an operatorId smuggled into the body", async () => {
    const res = await post(t.operatorId, { ...body({ notes: "smuggle" }), operatorId: other.operatorId });
    expect(res.status).toBe(201);
    const created = (await res.json()).transaction;
    expect(created.operatorId).toBe(t.operatorId);
    expect(await db.operatorTransaction.count({ where: { operatorId: other.operatorId } })).toBe(0);
  });
});

describe("PATCH / DELETE /api/operators/[id]/transactions/[transactionId]", () => {
  async function seed(over: Record<string, unknown> = {}) {
    const res = await post(t.operatorId, body(over));
    return (await res.json()).transaction as { id: string; version: number };
  }

  it("updates with the current version, bumps it, and audits before/after", async () => {
    const created = await seed({ amount: 20, notes: "patch-me" });
    const res = await patch(t.operatorId, created.id, { ...body({ amount: 25.5, notes: "patched" }), expectedVersion: created.version });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.transaction.version).toBe(1);
    expect(json.transaction.amount).toBe(25.5);

    const audit = await db.auditLog.findFirstOrThrow({ where: { businessId: t.businessId, entityId: created.id, action: "operator.transaction.update" } });
    expect(audit.before).toMatchObject({ amount: "20", notes: "patch-me" });
    expect(audit.after).toMatchObject({ amount: "25.5", notes: "patched" });
    expect(audit.requestId).toBeTruthy();
  });

  it("a stale expectedVersion is 409 RESOURCE_MODIFIED with a string message", async () => {
    const created = await seed({ notes: "stale" });
    await patch(t.operatorId, created.id, { ...body({ amount: 1 }), expectedVersion: 0 });

    const res = await patch(t.operatorId, created.id, { ...body({ amount: 2 }), expectedVersion: 0 });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("RESOURCE_MODIFIED");
    expect(typeof json.error).toBe("string");
    expect(json.requestId).toBeTruthy();
    expect((await db.operatorTransaction.findUniqueOrThrow({ where: { id: created.id } })).amount.toString()).toBe("1");
  });

  it("an older app that sends no expectedVersion still saves", async () => {
    const created = await seed();
    const res = await patch(t.operatorId, created.id, body({ amount: 33 }));
    expect(res.status).toBe(200);
  });

  it("another tenant's transaction is 404 for PATCH and DELETE and stays intact", async () => {
    auth.current = { businessId: other.businessId, userId: other.userId, ownerName: "Other Owner" };
    const theirs = (await (await post(other.operatorId, body({ amount: 9, notes: "theirs" }))).json()).transaction as { id: string };

    auth.current = { businessId: t.businessId, userId: t.userId, ownerName: "Test Owner" };
    const patched = await patch(other.operatorId, theirs.id, body({ amount: 1 }));
    expect(patched.status).toBe(404);
    const patchedViaOwnOperator = await patch(t.operatorId, theirs.id, body({ amount: 1 }));
    expect(patchedViaOwnOperator.status).toBe(404);
    const removed = await remove(t.operatorId, theirs.id);
    expect(removed.status).toBe(404);
    expect((await removed.json()).code).toBe("NOT_FOUND");

    const stored = await db.operatorTransaction.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(stored.amount.toString()).toBe("9");
    expect(stored.version).toBe(0);
  });

  it("DELETE removes the row, audits it, and a second DELETE is 404", async () => {
    const created = await seed({ amount: 15, notes: "delete-me" });
    const res = await remove(t.operatorId, created.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await db.operatorTransaction.count({ where: { id: created.id } })).toBe(0);

    const audit = await db.auditLog.findFirstOrThrow({ where: { businessId: t.businessId, entityId: created.id, action: "operator.transaction.delete" } });
    expect(audit.before).toMatchObject({ amount: "15", notes: "delete-me" });

    expect((await remove(t.operatorId, created.id)).status).toBe(404);
  });

  it("validation: a malformed PATCH body is 422 and nothing changes", async () => {
    const created = await seed({ amount: 77 });
    const res = await patch(t.operatorId, created.id, { ...body({ amount: -1 }), expectedVersion: 0 });
    expect(res.status).toBe(422);
    expect((await db.operatorTransaction.findUniqueOrThrow({ where: { id: created.id } })).amount.toString()).toBe("77");
  });
});

describe("GET list and detail", () => {
  it("transactions list pages with limit/cursor and keeps the legacy key; no limit returns a bounded page", async () => {
    const own = await createTenant("optx-route-list");
    try {
      auth.current = { businessId: own.businessId, userId: own.userId, ownerName: "Test Owner" };
      for (let i = 1; i <= 3; i++) {
        await post(own.operatorId, body({ amount: i, date: `2026-09-0${i}` }));
      }
      const page1 = await (await listTx(new Request(`${txUrl(own.operatorId)}?limit=2`), { params: Promise.resolve({ id: own.operatorId }) })).json();
      expect(page1.transactions.map((r: { amount: number }) => r.amount)).toEqual([3, 2]);
      expect(page1.nextCursor).toBeTruthy();
      const page2 = await (
        await listTx(new Request(`${txUrl(own.operatorId)}?limit=2&cursor=${page1.nextCursor}`), { params: Promise.resolve({ id: own.operatorId }) })
      ).json();
      expect(page2.transactions.map((r: { amount: number }) => r.amount)).toEqual([1]);
      expect(page2.nextCursor).toBeNull();

      const legacy = await (await listTx(new Request(txUrl(own.operatorId)), { params: Promise.resolve({ id: own.operatorId }) })).json();
      expect(legacy.transactions).toHaveLength(3);

      const bad = await listTx(new Request(`${txUrl(own.operatorId)}?limit=abc`), { params: Promise.resolve({ id: own.operatorId }) });
      expect(bad.status).toBe(400);
    } finally {
      await cleanupTenant(own.businessId);
    }
  });

  it("operator detail returns the original keys plus nextCursor, numeric money, and never the PIN hash", async () => {
    const own = await createTenant("optx-route-detail");
    try {
      auth.current = { businessId: own.businessId, userId: own.userId, ownerName: "Test Owner" };
      await db.operator.update({
        where: { id: own.operatorId },
        data: { defaultMonthlySalary: "1000.10", joiningDate: new Date(2026, 9, 1), pinHash: "very-secret-hash", canLogin: true },
      });
      await post(own.operatorId, body({ amount: 100.05, businessEffect: "SALARY_PAYMENT", deductFromSalary: false, date: "2026-10-05" }));

      const res = await getDetail(new Request(`${URL_BASE}/api/operators/detail?id=${own.operatorId}&month=2026-10`), undefined);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain("very-secret-hash");
      const json = JSON.parse(text);
      expect(Object.keys(json).sort()).toEqual(["categories", "detail", "lifetimeSalary", "nextCursor", "salary", "transactions"]);
      expect(json.salary.baseSalary).toBe(1000.1);
      expect(json.salary.alreadyPaid).toBe(100.05);
      expect(json.salary.payable).toBe(900.05);
      expect(json.transactions).toHaveLength(1);
      expect(json.transactions[0].amount).toBe(100.05);
    } finally {
      await cleanupTenant(own.businessId);
    }
  });

  it("operator detail: missing id and bad month are 400, an unknown or foreign operator is 404", async () => {
    expect((await getDetail(new Request(`${URL_BASE}/api/operators/detail`), undefined)).status).toBe(400);
    expect((await getDetail(new Request(`${URL_BASE}/api/operators/detail?id=${t.operatorId}&month=2026-13`), undefined)).status).toBe(400);
    expect((await getDetail(new Request(`${URL_BASE}/api/operators/detail?id=${t.operatorId}&month=banana`), undefined)).status).toBe(400);
    const foreign = await getDetail(new Request(`${URL_BASE}/api/operators/detail?id=${other.operatorId}`), undefined);
    expect(foreign.status).toBe(404);
    expect((await foreign.json()).code).toBe("NOT_FOUND");
  });
});
