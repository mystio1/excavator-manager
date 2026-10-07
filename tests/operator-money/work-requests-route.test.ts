import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { cleanupTenant, createTenant, fakeRequest, type TestTenant } from "../helpers/tenant";

/**
 * Operator-portal and work-request routes: the standard error contract on
 * every failure, and the response shapes installed Android apps already read.
 * Only the session lookups are replaced (see transactions-route.test.ts).
 */

type Who = { businessId: string; userId: string; ownerName: string };

const auth = vi.hoisted(() => ({
  owner: null as null | { businessId: string; userId: string; ownerName: string },
  operator: null as null | { businessId: string; operatorId: string; operatorLang: string },
}));

vi.mock("@/lib/api-auth", () => {
  const unauthorized = () => Response.json({ error: "Please log in again.", code: "UNAUTHORIZED" }, { status: 401 });
  return {
    requireBusinessApi: async () => {
      const s = auth.owner;
      if (!s) return { session: null, error: unauthorized() };
      return { session: { ...s, businessFrozen: false }, actor: { type: "OWNER", id: s.userId, name: s.ownerName }, error: null };
    },
    requireOperatorApi: async () => {
      const s = auth.operator;
      if (!s) return { session: null, error: unauthorized() };
      return {
        session: { ...s, businessFrozen: false },
        actor: { type: "OPERATOR", id: s.operatorId, name: `operator:${s.operatorId}` },
        error: null,
      };
    },
  };
});

import { GET as portalHome } from "@/app/api/operator/home/route";
import { POST as portalStart } from "@/app/api/operator/work/start/route";
import { POST as portalEnd } from "@/app/api/operator/work/end/route";
import { POST as portalEdit } from "@/app/api/operator/work/edit/route";
import { POST as approveRoute } from "@/app/api/work-requests/[id]/approve/route";
import { POST as rejectRoute } from "@/app/api/work-requests/[id]/reject/route";
import { DELETE as unassignRoute, POST as assignRoute } from "@/app/api/excavators/[id]/assign-operator/route";

let t: TestTenant;
let other: TestTenant;

const BASE = "https://app.example.test";
const asOwner = (tenant: TestTenant, who: Partial<Who> = {}) => {
  auth.owner = { businessId: tenant.businessId, userId: tenant.userId, ownerName: "Test Owner", ...who };
};
const asOperator = (tenant: TestTenant) => {
  auth.operator = { businessId: tenant.businessId, operatorId: tenant.operatorId, operatorLang: "en" };
};
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

const post = <C>(handler: (req: Request, ctx: C) => Promise<Response>, path: string, body: unknown, ctx?: C) =>
  handler(fakeRequest(`${BASE}${path}`, { body }), ctx as C);

beforeAll(async () => {
  t = await createTenant("wreq-route");
  other = await createTenant("wreq-route-other");
});

beforeEach(() => {
  asOwner(t);
  asOperator(t);
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await cleanupTenant(other.businessId);
});

describe("assign-operator route", () => {
  it("POST assigns (200 { ok: true }), DELETE ends, and a foreign machine is a 404 with the standard contract", async () => {
    const assigned = await post(assignRoute, `/api/excavators/${t.excavatorId}/assign-operator`, { operatorId: t.operatorId }, idCtx(t.excavatorId));
    expect(assigned.status).toBe(200);
    expect(await assigned.json()).toEqual({ ok: true });
    expect((await db.excavator.findUniqueOrThrow({ where: { id: t.excavatorId } })).currentOperatorId).toBe(t.operatorId);

    const foreign = await post(assignRoute, `/api/excavators/${other.excavatorId}/assign-operator`, { operatorId: t.operatorId }, idCtx(other.excavatorId));
    expect(foreign.status).toBe(404);
    const json = await foreign.json();
    expect(json.code).toBe("NOT_FOUND");
    expect(typeof json.error).toBe("string");

    const invalid = await post(assignRoute, `/api/excavators/${t.excavatorId}/assign-operator`, { operatorId: "" }, idCtx(t.excavatorId));
    expect(invalid.status).toBe(422);

    const ended = await unassignRoute(fakeRequest(`${BASE}/api/excavators/${t.excavatorId}/assign-operator`, { method: "DELETE" }), idCtx(t.excavatorId));
    expect(ended.status).toBe(200);
    expect((await db.excavator.findUniqueOrThrow({ where: { id: t.excavatorId } })).currentOperatorId).toBeNull();
  });
});

describe("operator portal routes", () => {
  it("signed out is the standard 401", async () => {
    auth.operator = null;
    const res = await post(portalStart, "/api/operator/work/start", { startHourMeter: 1 });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  });

  it("start without an assigned machine: 403 FORBIDDEN, message kept as a string", async () => {
    const res = await post(portalStart, "/api/operator/work/start", { startHourMeter: 1 });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("You are not assigned to a machine.");
    expect(json.code).toBe("FORBIDDEN");
    expect(json.requestId).toBeTruthy();
  });

  it("start / end / edit keep their { request } response shape and string-coerced readings still work", async () => {
    await post(assignRoute, `/api/excavators/${t.excavatorId}/assign-operator`, { operatorId: t.operatorId }, idCtx(t.excavatorId));

    const started = await post(portalStart, "/api/operator/work/start", { startHourMeter: "50.5", siteName: "Gamma" });
    expect(started.status).toBe(200);
    const { request } = await started.json();
    expect(request).toMatchObject({ status: "ACTIVE", startHourMeter: 50.5, siteName: "Gamma", operatorId: t.operatorId });

    const edited = await post(portalEdit, "/api/operator/work/edit", { requestId: request.id, startHourMeter: 51 });
    expect(edited.status).toBe(200);
    expect((await edited.json()).request.startHourMeter).toBe(51);

    const tooLow = await post(portalEnd, "/api/operator/work/end", { requestId: request.id, endHourMeter: 51 });
    expect(tooLow.status).toBe(422);
    expect((await tooLow.json()).code).toBe("VALIDATION_FAILED");

    const ended = await post(portalEnd, "/api/operator/work/end", { requestId: request.id, endHourMeter: 60 });
    expect(ended.status).toBe(200);
    expect((await ended.json()).request).toMatchObject({ status: "PENDING", endHourMeter: 60 });

    const unknown = await post(portalEnd, "/api/operator/work/end", { requestId: "nope", endHourMeter: 70 });
    expect(unknown.status).toBe(404);

    const missingField = await post(portalEnd, "/api/operator/work/end", { requestId: request.id });
    expect(missingField.status).toBe(422);
  });

  it("home returns the original keys", async () => {
    await post(assignRoute, `/api/excavators/${t.excavatorId}/assign-operator`, { operatorId: t.operatorId }, idCtx(t.excavatorId));
    const res = await portalHome(new Request(`${BASE}/api/operator/home`), undefined);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual(["activeSession", "excavator", "openRequests", "operatorLang", "recentRequests"]);
    expect(json.excavator.id).toBe(t.excavatorId);
  });
});

describe("work-request review routes", () => {
  async function pending() {
    await post(assignRoute, `/api/excavators/${t.excavatorId}/assign-operator`, { operatorId: t.operatorId }, idCtx(t.excavatorId));
    const { request } = await (await post(portalStart, "/api/operator/work/start", { startHourMeter: 100 })).json();
    await post(portalEnd, "/api/operator/work/end", { requestId: request.id, endHourMeter: 106.25 });
    return request.id as string;
  }
  const approveBody = (over: Record<string, unknown> = {}) => ({
    customerId: t.customerId,
    siteName: "Delta",
    startHourMeter: 100,
    endHourMeter: 106.25,
    ...over,
  });

  it("approve returns { session }, audits with the session id, and a repeat is 409 CONFLICT", async () => {
    const id = await pending();
    const res = await post(approveRoute, `/api/work-requests/${id}/approve`, approveBody(), idCtx(id));
    expect(res.status).toBe(200);
    const { session } = await res.json();
    expect(session).toMatchObject({ status: "COMPLETED", totalHours: 6.25 });

    const audit = await db.auditLog.findFirstOrThrow({ where: { businessId: t.businessId, entityId: id, action: "operator.workRequest.approve" } });
    expect(audit.details).toMatchObject({ workSessionId: session.id });
    expect(audit.requestId).toBeTruthy();

    const again = await post(approveRoute, `/api/work-requests/${id}/approve`, approveBody(), idCtx(id));
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("CONFLICT");
  });

  it("the request id comes from the URL, never the body", async () => {
    const id = await pending();
    const decoy = await pending();
    const res = await post(approveRoute, `/api/work-requests/${id}/approve`, approveBody({ requestId: decoy }), idCtx(id));
    expect(res.status).toBe(200);
    expect((await db.operatorWorkRequest.findUniqueOrThrow({ where: { id } })).status).toBe("APPROVED");
    expect((await db.operatorWorkRequest.findUniqueOrThrow({ where: { id: decoy } })).status).toBe("PENDING");
  });

  it("approve validation: end <= start is 422 with the field message", async () => {
    const id = await pending();
    const res = await post(approveRoute, `/api/work-requests/${id}/approve`, approveBody({ endHourMeter: 99 }), idCtx(id));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_FAILED");
    expect(json.error).toBe("End hour meter must be greater than the starting hour meter");
  });

  it("another tenant's owner gets 404 for approve and reject", async () => {
    const id = await pending();
    asOwner(other);
    const approved = await post(approveRoute, `/api/work-requests/${id}/approve`, approveBody({ customerId: other.customerId }), idCtx(id));
    expect(approved.status).toBe(404);
    const rejected = await post(rejectRoute, `/api/work-requests/${id}/reject`, { note: "x" }, idCtx(id));
    expect(rejected.status).toBe(404);
    expect((await db.operatorWorkRequest.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
  });

  it("reject returns { ok: true } and audits the reason", async () => {
    const id = await pending();
    const res = await post(rejectRoute, `/api/work-requests/${id}/reject`, { note: "check meter" }, idCtx(id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const audit = await db.auditLog.findFirstOrThrow({ where: { businessId: t.businessId, entityId: id, action: "operator.workRequest.reject" } });
    expect(audit.reason).toBe("check meter");

    const again = await post(rejectRoute, `/api/work-requests/${id}/reject`, {}, idCtx(id));
    expect(again.status).toBe(409);
  });
});
