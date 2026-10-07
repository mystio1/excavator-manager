import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditActor } from "@/lib/audit";

// The routes authenticate through requireBusinessApi(); tests inject the
// signed-in owner (or nobody) instead of going through NextAuth cookies.
const signedIn = vi.hoisted(() => ({ current: null as { businessId: string; actor: AuditActor } | null }));
vi.mock("@/lib/api-auth", async () => {
  const { errorResponse } = await import("@/lib/api-error");
  return {
    requireBusinessApi: async () =>
      signedIn.current
        ? {
            session: { businessId: signedIn.current.businessId, userId: signedIn.current.actor.id, ownerName: signedIn.current.actor.name },
            actor: signedIn.current.actor,
            error: null,
          }
        : { session: null, error: errorResponse("UNAUTHORIZED", "Please log in again.") },
  };
});

import { db } from "@/lib/db";
import { GET as listApprovals } from "@/app/api/approvals/route";
import { GET as listOperators } from "@/app/api/operators/route";
import { PATCH as patchOperator, DELETE as deleteOperator } from "@/app/api/operators/[id]/route";
import { PATCH as patchPin } from "@/app/api/operators/[id]/pin/route";
import { POST as legacyApprove } from "@/app/api/operators/[id]/approve-join/route";
import { POST as legacyDecline } from "@/app/api/operators/[id]/decline-join/route";
import { GET as listJoinRequests } from "@/app/api/operators/join-requests/route";
import { POST as approveRoute } from "@/app/api/operators/join-requests/[requestId]/approve/route";
import { POST as declineRoute } from "@/app/api/operators/join-requests/[requestId]/decline/route";
import { hashPassword, verifyPassword } from "@/lib/password";
import { MAX_JOIN_CODE_ATTEMPTS } from "@/lib/services/operators";
import { cleanupTenant, createTenant, fakeRequest, type TestTenant } from "../helpers/tenant";
import { fileJoinRequest, uniqueMobile, wrongCode } from "./helpers";

/**
 * Route handlers: standard error contract ({ error: string, code, requestId }),
 * right status codes, request-id based approve/decline, and the legacy
 * operator-id endpoints kept for installed apps.
 */

const BASE = "https://app.example.test/api";
let t: TestTenant;
let other: TestTenant;
const tenants: string[] = [];

beforeAll(async () => {
  t = await createTenant("join-routes");
  other = await createTenant("join-routes-other");
  tenants.push(t.businessId, other.businessId);
});

beforeEach(() => {
  signedIn.current = { businessId: t.businessId, actor: t.actor };
});

afterAll(async () => {
  signedIn.current = null;
  for (const id of tenants) await cleanupTenant(id);
  await db.$disconnect();
});

const byId = (id: string) => ({ params: Promise.resolve({ id }) });
const byRequest = (requestId: string) => ({ params: Promise.resolve({ requestId }) });
const post = (path: string, body?: unknown) => fakeRequest(`${BASE}${path}`, { method: "POST", body: body ?? {} });
const get = (path: string) => fakeRequest(`${BASE}${path}`, { method: "GET" });

async function expectError(res: Response, status: number, code: string) {
  const body = await res.json();
  expect(res.status).toBe(status);
  expect(body.code).toBe(code);
  expect(typeof body.error).toBe("string");
  expect(body.requestId).toBeTruthy();
  return body as { error: string; code: string; requestId: string };
}

describe("authentication", () => {
  it("every join/operator admin route answers 401 UNAUTHORIZED when signed out", async () => {
    signedIn.current = null;
    const id = "does-not-matter";
    const responses = await Promise.all([
      listApprovals(get("/approvals"), undefined),
      listOperators(get("/operators"), undefined),
      listJoinRequests(get("/operators/join-requests"), undefined),
      approveRoute(post(`/operators/join-requests/${id}/approve`, { code: "123456" }), byRequest(id)),
      declineRoute(post(`/operators/join-requests/${id}/decline`), byRequest(id)),
      legacyApprove(post(`/operators/${id}/approve-join`), byId(id)),
      legacyDecline(post(`/operators/${id}/decline-join`), byId(id)),
      patchPin(fakeRequest(`${BASE}/operators/${id}/pin`, { method: "PATCH", body: { canLogin: false } }), byId(id)),
      patchOperator(fakeRequest(`${BASE}/operators/${id}`, { method: "PATCH", body: {} }), byId(id)),
      deleteOperator(fakeRequest(`${BASE}/operators/${id}`, { method: "DELETE" }), byId(id)),
    ]);
    for (const res of responses) await expectError(res, 401, "UNAUTHORIZED");
  });
});

describe("POST /api/operators/join-requests/[requestId]/approve", () => {
  it("wrong code -> 422 with attempts left; right code -> 200; replay -> 409", async () => {
    const { requestId, code, mobile } = await fileJoinRequest(t, { name: "Route Approve" });
    const run = (body: unknown) => approveRoute(post(`/operators/join-requests/${requestId}/approve`, body), byRequest(requestId));

    const wrong = await expectError(await run({ code: wrongCode(code) }), 422, "VALIDATION_FAILED");
    expect(wrong.error).toMatch(/4 attempts left/);

    const missing = await expectError(await run({}), 422, "VALIDATION_FAILED");
    expect(missing.error).toMatch(/6-digit/);

    const badFormat = await expectError(await run({ code: "12ab" }), 422, "VALIDATION_FAILED");
    expect(badFormat.error).toMatch(/6-digit/);

    const ok = await run({ code });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body).toMatchObject({ ok: true, createdOperator: true, operator: { name: "Route Approve", mobile } });
    expect(JSON.stringify(body)).not.toMatch(/pinHash|verificationHash/);

    await expectError(await run({ code }), 409, "CONFLICT");
  });

  it("five wrong codes lock the request: the fifth answers 409, later attempts too", async () => {
    const { requestId, code } = await fileJoinRequest(t);
    const run = (c: string) => approveRoute(post(`/operators/join-requests/${requestId}/approve`, { code: c }), byRequest(requestId));

    for (let i = 1; i < MAX_JOIN_CODE_ATTEMPTS; i++) await expectError(await run(wrongCode(code)), 422, "VALIDATION_FAILED");
    const locked = await expectError(await run(wrongCode(code)), 409, "CONFLICT");
    expect(locked.error).toMatch(/locked/i);
    await expectError(await run(code), 409, "CONFLICT");
  });

  it("an expired request answers 409 mentioning expiry", async () => {
    const { requestId, code } = await fileJoinRequest(t);
    await db.operatorJoinRequest.update({ where: { id: requestId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await approveRoute(post(`/operators/join-requests/${requestId}/approve`, { code }), byRequest(requestId));
    expect((await expectError(res, 409, "CONFLICT")).error).toMatch(/expired/i);
  });

  it("another business's request -> 404 NOT_FOUND", async () => {
    const { requestId, code } = await fileJoinRequest(t);
    signedIn.current = { businessId: other.businessId, actor: other.actor };
    const res = await approveRoute(post(`/operators/join-requests/${requestId}/approve`, { code }), byRequest(requestId));
    await expectError(res, 404, "NOT_FOUND");
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("PENDING");
  });

  it("a legacy request (no code) approves with an empty body", async () => {
    const legacy = await db.operatorJoinRequest.create({
      data: {
        businessId: t.businessId,
        name: "Legacy Route",
        mobile: uniqueMobile(),
        pinHash: await hashPassword("2468"),
        verificationHash: "",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const res = await approveRoute(post(`/operators/join-requests/${legacy.id}/approve`, {}), byRequest(legacy.id));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/operators/join-requests/[requestId]/decline", () => {
  it("declines (200) once, then 409; another business gets 404", async () => {
    const { requestId } = await fileJoinRequest(t);

    signedIn.current = { businessId: other.businessId, actor: other.actor };
    await expectError(await declineRoute(post(`/operators/join-requests/${requestId}/decline`), byRequest(requestId)), 404, "NOT_FOUND");

    signedIn.current = { businessId: t.businessId, actor: t.actor };
    const ok = await declineRoute(post(`/operators/join-requests/${requestId}/decline`), byRequest(requestId));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    await expectError(await declineRoute(post(`/operators/join-requests/${requestId}/decline`), byRequest(requestId)), 409, "CONFLICT");
  });
});

describe("GET lists", () => {
  it("/api/operators/join-requests and /api/approvals expose pending requests with requiresCode and no hashes", async () => {
    const { requestId } = await fileJoinRequest(t, { name: "Listed Person" });

    const direct = await (await listJoinRequests(get("/operators/join-requests"), undefined)).json();
    const viaApprovals = await (await listApprovals(get("/approvals"), undefined)).json();

    for (const list of [direct.joinRequests, viaApprovals.joinRequests]) {
      const row = list.find((r: { id: string }) => r.id === requestId);
      expect(row).toMatchObject({ name: "Listed Person", requiresCode: true });
      expect(JSON.stringify(list)).not.toMatch(/pinHash|verificationHash|\$2[aby]\$/);
    }
    expect(Array.isArray(viaApprovals.logs)).toBe(true);
    expect(Array.isArray(viaApprovals.workRequests)).toBe(true);
  });

  it("/api/operators keeps its legacy keys and pages with limit/cursor", async () => {
    const pageTenant = await createTenant("join-routes-page");
    tenants.push(pageTenant.businessId);
    signedIn.current = { businessId: pageTenant.businessId, actor: pageTenant.actor };
    await db.operator.createMany({
      data: [1, 2, 3].map((i) => ({
        businessId: pageTenant.businessId,
        name: `Page ${i}`,
        mobile: uniqueMobile(),
        createdAt: new Date(Date.UTC(2026, 0, i)),
      })),
    });

    const legacy = await (await listOperators(get("/operators"), undefined)).json();
    expect(legacy.operators).toHaveLength(4); // the tenant's own + 3
    expect(legacy.nextCursor).toBeNull();
    expect(legacy).toHaveProperty("pendingLogCount");
    expect(legacy).toHaveProperty("pendingWorkRequestCount");
    expect(legacy).toHaveProperty("joinRequests");
    expect(legacy).toHaveProperty("ranking");
    expect(legacy.operators[0]).toHaveProperty("remainingSalary");
    expect(typeof legacy.operators[0].defaultMonthlySalary).toBe("number"); // money is a plain number in JSON

    const first = await (await listOperators(get("/operators?limit=3"), undefined)).json();
    expect(first.operators).toHaveLength(3);
    expect(first.nextCursor).toBeTruthy();
    expect(first).toHaveProperty("joinRequests");

    const second = await (await listOperators(get(`/operators?limit=3&cursor=${first.nextCursor}`), undefined)).json();
    expect(second.operators).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(second).not.toHaveProperty("joinRequests"); // "Load more" returns only the next slice
    const ids = [...first.operators, ...second.operators].map((o: { id: string }) => o.id);
    expect(new Set(ids).size).toBe(4);

    await expectError(await listOperators(get("/operators?limit=0"), undefined), 400, "BAD_REQUEST");
  });
});

describe("legacy operator-id endpoints", () => {
  it("approve-join: a coded request answers 409 telling the admin to update; a legacy one approves", async () => {
    const operator = await db.operator.create({ data: { businessId: t.businessId, name: "Via Old UI", mobile: uniqueMobile() } });
    const { requestId } = await fileJoinRequest(t, { mobile: operator.mobile });

    const refused = await expectError(await legacyApprove(post(`/operators/${operator.id}/approve-join`), byId(operator.id)), 409, "CONFLICT");
    expect(refused.error).toMatch(/update the app|web app/i);
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("PENDING");

    // The same operator, but the pending request is a pre-redesign one.
    await db.operatorJoinRequest.update({ where: { id: requestId }, data: { verificationHash: "" } });
    const ok = await legacyApprove(post(`/operators/${operator.id}/approve-join`), byId(operator.id));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect((await db.operator.findUniqueOrThrow({ where: { id: operator.id } })).canLogin).toBe(true);
  });

  it("decline-join works by operator id; unknown ids answer 404", async () => {
    const operator = await db.operator.create({ data: { businessId: t.businessId, name: "Decline Old", mobile: uniqueMobile() } });
    const { requestId } = await fileJoinRequest(t, { mobile: operator.mobile });

    const ok = await legacyDecline(post(`/operators/${operator.id}/decline-join`), byId(operator.id));
    expect(ok.status).toBe(200);
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("REJECTED");

    await expectError(await legacyDecline(post(`/operators/${operator.id}/decline-join`), byId(operator.id)), 404, "NOT_FOUND");
  });
});

describe("operator edit routes", () => {
  it("PATCH /pin: bad PIN -> 422, good PIN -> 200 with the new version and a bumped tokenVersion", async () => {
    const op = await db.operator.create({ data: { businessId: t.businessId, name: "Pin Route", mobile: uniqueMobile() } });
    const call = (body: unknown) => patchPin(fakeRequest(`${BASE}/operators/${op.id}/pin`, { method: "PATCH", body }), byId(op.id));

    await expectError(await call({ canLogin: true, pin: "12" }), 422, "VALIDATION_FAILED");
    await expectError(await call({ canLogin: true, pin: "12ab" }), 422, "VALIDATION_FAILED");

    const ok = await call({ canLogin: true, pin: "86420", expectedVersion: op.version });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, version: op.version + 1 });
    const after = await db.operator.findUniqueOrThrow({ where: { id: op.id } });
    expect(await verifyPassword("86420", after.pinHash ?? "")).toBe(true);
    expect(after.tokenVersion).toBe(op.tokenVersion + 1);

    // The version the client held is now stale.
    await expectError(await call({ canLogin: true, pin: "86421", expectedVersion: op.version }), 409, "RESOURCE_MODIFIED");
  });

  it("PATCH /operators/[id]: stale expectedVersion -> 409 RESOURCE_MODIFIED; other business -> 404", async () => {
    const op = await db.operator.create({ data: { businessId: t.businessId, name: "Edit Route", mobile: uniqueMobile() } });
    const call = (body: unknown) => patchOperator(fakeRequest(`${BASE}/operators/${op.id}`, { method: "PATCH", body }), byId(op.id));
    const edit = { name: "Edited", mobile: op.mobile, defaultMonthlySalary: 12000 };

    const ok = await call({ ...edit, expectedVersion: op.version });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, version: op.version + 1 });
    await expectError(await call({ ...edit, expectedVersion: op.version }), 409, "RESOURCE_MODIFIED");
    await expectError(await call({ name: "" }), 422, "VALIDATION_FAILED");

    signedIn.current = { businessId: other.businessId, actor: other.actor };
    await expectError(await call(edit), 404, "NOT_FOUND");
  });

  it("DELETE /operators/[id]: validates ?expectedVersion, archives, and signs the operator out (tokenVersion)", async () => {
    const op = await db.operator.create({ data: { businessId: t.businessId, name: "Delete Route", mobile: uniqueMobile() } });
    const call = (qs: string) => deleteOperator(fakeRequest(`${BASE}/operators/${op.id}${qs}`, { method: "DELETE" }), byId(op.id));

    await expectError(await call("?expectedVersion=abc"), 400, "BAD_REQUEST");
    await expectError(await call(`?expectedVersion=${op.version + 3}`), 409, "RESOURCE_MODIFIED");

    const ok = await call(`?expectedVersion=${op.version}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    const after = await db.operator.findUniqueOrThrow({ where: { id: op.id } });
    expect(after.isArchived).toBe(true);
    expect(after.tokenVersion).toBe(op.tokenVersion + 1);
  });
});
