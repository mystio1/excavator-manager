import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { cleanupTenant, createTenant, fakeRequest, type TestTenant } from "../helpers/tenant";
import { auditRows, billSession, newActiveSession, newMachine, ok } from "./helpers";
import { addDailyLog } from "@/lib/services/workSessions";

/**
 * The fleet routes end to end (withApi + parseBody + services + real DB): the
 * standard error contract (string `error` + machine-readable `code` + requestId),
 * optimistic concurrency over HTTP, and tenant isolation. Only the session
 * lookup is replaced: requireBusinessApi returns whichever throwaway tenant the
 * test selected, exactly as it would for a signed-in owner.
 */

const auth = vi.hoisted(() => ({
  current: null as null | { businessId: string; userId: string; ownerName: string },
}));

vi.mock("@/lib/api-auth", () => ({
  requireBusinessApi: async () => {
    const s = auth.current;
    if (!s) {
      // Same response the real helper builds (inside withApi, so it carries the request id).
      const { errorResponse } = await import("@/lib/api-error");
      return { session: null, error: errorResponse("UNAUTHORIZED", "Please log in again.") };
    }
    return {
      session: { ...s, businessFrozen: false },
      actor: { type: "OWNER", id: s.userId, name: s.ownerName },
      error: null,
    };
  },
}));

import { PATCH as patchSession, DELETE as deleteSession } from "@/app/api/work-sessions/[id]/route";
import { PATCH as patchLog, DELETE as deleteLog } from "@/app/api/daily-logs/[logId]/route";
import { POST as approveLog } from "@/app/api/daily-logs/[logId]/approve/route";
import { POST as rejectLog } from "@/app/api/daily-logs/[logId]/reject/route";
import { GET as getMachine, PATCH as patchMachine, DELETE as archiveMachine } from "@/app/api/excavators/[id]/route";
import { GET as listMachines, POST as createMachine } from "@/app/api/excavators/route";
import { PUT as reorderMachines } from "@/app/api/excavators/reorder/route";
import { GET as workHistory } from "@/app/api/excavators/[id]/work-history/route";
import { POST as startWorkRoute } from "@/app/api/excavators/[id]/start-work/route";
import { POST as stopWorkRoute } from "@/app/api/excavators/[id]/stop-work/route";
import { POST as addLogRoute } from "@/app/api/excavators/[id]/daily-logs/route";
import { POST as createServiceRecordRoute } from "@/app/api/excavators/[id]/service-records/route";
import { PATCH as setSite } from "@/app/api/excavators/[id]/site/route";
import { POST as createServiceItem } from "@/app/api/service-items/route";

let t: TestTenant;
let other: TestTenant;

const URL_BASE = "https://app.example.test";
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const logCtx = (logId: string) => ({ params: Promise.resolve({ logId }) });

// Handlers without route params still receive a (here empty) context argument.
const listMachinesNow = () => listMachines(new Request(`${URL_BASE}/api/excavators`), undefined);
const createMachineNow = (body: unknown) => createMachine(fakeRequest(`${URL_BASE}/api/excavators`, { body }), undefined);
const reorder = (body: unknown) =>
  reorderMachines(fakeRequest(`${URL_BASE}/api/excavators/reorder`, { method: "PUT", body }), undefined);
const createItem = (body: unknown) =>
  createServiceItem(fakeRequest(`${URL_BASE}/api/service-items`, { body }), undefined);

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const json = (await res.json()) as { error: unknown; code: string; requestId?: string };
  // `error` stays a plain string (installed Android apps show it as text).
  expect(typeof json.error).toBe("string");
  expect(json.code).toBe(code);
  expect(json.requestId).toBeTruthy();
  return json;
}

beforeAll(async () => {
  t = await createTenant("fleet-routes");
  other = await createTenant("fleet-routes-other");
});

beforeEach(() => {
  auth.current = { businessId: t.businessId, userId: t.userId, ownerName: "Test Owner" };
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await cleanupTenant(other.businessId);
});

const sessionBody = (over: Record<string, unknown> = {}) => ({
  customerId: t.customerId,
  operatorId: t.operatorId,
  siteName: "Test Site",
  startDate: "2026-10-01",
  startHourMeter: 100,
  totalHours: 3,
  ...over,
});

describe("auth and validation", () => {
  it("every fleet route answers 401 in the standard contract when signed out", async () => {
    auth.current = null;
    const res = await patchSession(fakeRequest(`${URL_BASE}/api/work-sessions/x`, { method: "PATCH", body: sessionBody() }), idCtx("x"));
    await expectError(res, 401, "UNAUTHORIZED");
    await expectError(await listMachinesNow(), 401, "UNAUTHORIZED");
    await expectError(await reorder({ orderedIds: ["x"] }), 401, "UNAUTHORIZED");
  });

  it("bad bodies are 422 VALIDATION_FAILED (or 400 for malformed JSON), never a 500", async () => {
    const m = await newMachine(t);
    const s = await newActiveSession(t, m.id);

    const missing = await patchSession(
      fakeRequest(`${URL_BASE}/api/work-sessions/${s.id}`, { method: "PATCH", body: { customerId: "" } }),
      idCtx(s.id),
    );
    await expectError(missing, 422, "VALIDATION_FAILED");

    const badVersion = await patchSession(
      fakeRequest(`${URL_BASE}/api/work-sessions/${s.id}`, { method: "PATCH", body: sessionBody({ expectedVersion: "abc" }) }),
      idCtx(s.id),
    );
    await expectError(badVersion, 422, "VALIDATION_FAILED");

    const malformed = await patchSession(
      new Request(`${URL_BASE}/api/work-sessions/${s.id}`, { method: "PATCH", body: "{not json", headers: { "content-type": "application/json" } }),
      idCtx(s.id),
    );
    await expectError(malformed, 400, "BAD_REQUEST");

    const badQuery = await deleteSession(
      fakeRequest(`${URL_BASE}/api/work-sessions/${s.id}?expectedVersion=abc`, { method: "DELETE" }),
      idCtx(s.id),
    );
    await expectError(badQuery, 422, "VALIDATION_FAILED");

    const emptyItems = await createServiceRecordRoute(
      fakeRequest(`${URL_BASE}/api/excavators/${m.id}/service-records`, {
        body: { serviceDate: "2026-10-01", hourMeterAtService: 100, items: [] },
      }),
      idCtx(m.id),
    );
    await expectError(emptyItems, 422, "VALIDATION_FAILED");

    const badReading = await addLogRoute(
      fakeRequest(`${URL_BASE}/api/excavators/${m.id}/daily-logs`, { body: { workSessionId: s.id, date: "2026-10-01" } }),
      idCtx(m.id),
    );
    await expectError(badReading, 422, "VALIDATION_FAILED");
  });
});

describe("work sessions over HTTP", () => {
  it("PATCH with a stale expectedVersion is 409 RESOURCE_MODIFIED with a readable message; a current one succeeds", async () => {
    const m = await newMachine(t);
    const s = await newActiveSession(t, m.id);
    const patch = (body: unknown) =>
      patchSession(fakeRequest(`${URL_BASE}/api/work-sessions/${s.id}`, { method: "PATCH", body }), idCtx(s.id));

    const okRes = await patch(sessionBody({ expectedVersion: 0, totalHours: 5 }));
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toEqual({ ok: true, version: 1 });

    const staleRes = await patch(sessionBody({ expectedVersion: 0, totalHours: 6 }));
    const json = await expectError(staleRes, 409, "RESOURCE_MODIFIED");
    expect(json.error).toMatch(/changed by someone else/i);
    expect((await db.workSession.findUniqueOrThrow({ where: { id: s.id } })).totalHours).toBe(5);

    // No expectedVersion at all (older apps): still accepted.
    expect((await patch(sessionBody({ totalHours: 7 }))).status).toBe(200);
  });

  it("DELETE of a billed job is 409 WORK_SESSION_ALREADY_BILLED; an unbilled one is removed", async () => {
    const m = await newMachine(t);
    const billed = await newActiveSession(t, m.id);
    await billSession(t, billed.id, m.id, "FLEET-ROUTE-1");
    const refused = await deleteSession(fakeRequest(`${URL_BASE}/api/work-sessions/${billed.id}`, { method: "DELETE" }), idCtx(billed.id));
    await expectError(refused, 409, "WORK_SESSION_ALREADY_BILLED");
    expect(await db.workSession.count({ where: { id: billed.id } })).toBe(1);

    const free = await newActiveSession(t, (await newMachine(t)).id);
    const removed = await deleteSession(fakeRequest(`${URL_BASE}/api/work-sessions/${free.id}?expectedVersion=0`, { method: "DELETE" }), idCtx(free.id));
    expect(removed.status).toBe(200);
    expect(await db.workSession.count({ where: { id: free.id } })).toBe(0);
  });

  it("another business's job is a 404 for PATCH and DELETE, and stays intact", async () => {
    const foreignMachine = await newMachine(other);
    const foreign = await newActiveSession(other, foreignMachine.id);
    const patched = await patchSession(
      fakeRequest(`${URL_BASE}/api/work-sessions/${foreign.id}`, { method: "PATCH", body: sessionBody() }),
      idCtx(foreign.id),
    );
    await expectError(patched, 404, "NOT_FOUND");
    const deleted = await deleteSession(fakeRequest(`${URL_BASE}/api/work-sessions/${foreign.id}`, { method: "DELETE" }), idCtx(foreign.id));
    await expectError(deleted, 404, "NOT_FOUND");
    expect(await db.workSession.findUniqueOrThrow({ where: { id: foreign.id } })).toMatchObject({ version: 0, status: "ACTIVE" });
  });

  it("start-work and stop-work take the machine from the URL and answer in the contract", async () => {
    const m = await newMachine(t);
    await db.excavator.update({ where: { id: m.id }, data: { status: "IDLE" } });
    const start = await startWorkRoute(
      fakeRequest(`${URL_BASE}/api/excavators/${m.id}/start-work`, {
        body: { customerId: t.customerId, siteName: "Route Site", startDate: "2026-10-02", startHourMeter: 100 },
      }),
      idCtx(m.id),
    );
    expect(start.status).toBe(200);
    const { session } = (await start.json()) as { session: { id: string } };

    const startAgain = await startWorkRoute(
      fakeRequest(`${URL_BASE}/api/excavators/${m.id}/start-work`, {
        body: { customerId: t.customerId, siteName: "Route Site", startDate: "2026-10-02", startHourMeter: 100 },
      }),
      idCtx(m.id),
    );
    await expectError(startAgain, 409, "CONFLICT");

    // A job id from another machine in the URL is not found, not stopped.
    const otherMachine = await newMachine(t);
    const wrong = await stopWorkRoute(
      fakeRequest(`${URL_BASE}/api/excavators/${otherMachine.id}/stop-work`, {
        body: { workSessionId: session.id, endDate: "2026-10-03", endHourMeter: 110 },
      }),
      idCtx(otherMachine.id),
    );
    await expectError(wrong, 404, "NOT_FOUND");

    const stopped = await stopWorkRoute(
      fakeRequest(`${URL_BASE}/api/excavators/${m.id}/stop-work`, {
        body: { workSessionId: session.id, endDate: "2026-10-03", endHourMeter: 110, expectedVersion: 0 },
      }),
      idCtx(m.id),
    );
    expect(stopped.status).toBe(200);
    expect(await stopped.json()).toMatchObject({ totalHours: 10, version: 1 });
  });
});

describe("daily readings over HTTP", () => {
  it("add, edit (conflict + success), approve/reject and delete", async () => {
    const m = await newMachine(t);
    const s = await newActiveSession(t, m.id);

    const added = await addLogRoute(
      fakeRequest(`${URL_BASE}/api/excavators/${m.id}/daily-logs`, {
        body: { workSessionId: s.id, date: "2026-10-01", startHourMeter: 100, endHourMeter: 108 },
      }),
      idCtx(m.id),
    );
    expect(added.status).toBe(200);
    const { logId, hoursWorked } = (await added.json()) as { logId: string; hoursWorked: number };
    expect(hoursWorked).toBe(8);

    const edit = (expectedVersion: number | undefined, endHourMeter: number) =>
      patchLog(
        fakeRequest(`${URL_BASE}/api/daily-logs/${logId}`, {
          method: "PATCH",
          body: { date: "2026-10-01", startHourMeter: 100, endHourMeter, expectedVersion },
        }),
        logCtx(logId),
      );
    const edited = await edit(0, 110);
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({ hoursWorked: 10, version: 1 });
    await expectError(await edit(0, 120), 409, "RESOURCE_MODIFIED");

    // approve / reject on a reading that is not pending: 409.
    await expectError(
      await approveLog(fakeRequest(`${URL_BASE}/api/daily-logs/${logId}/approve`), logCtx(logId)),
      409,
      "CONFLICT",
    );

    // A pending operator reading: stale version is refused, current one approves.
    const pending = await db.dailyWorkLog.create({
      data: { workSessionId: s.id, date: new Date("2026-10-02"), startHourMeter: 110, endHourMeter: 112, hoursWorked: 2, status: "PENDING", source: "OPERATOR" },
    });
    await expectError(
      await approveLog(fakeRequest(`${URL_BASE}/api/daily-logs/${pending.id}/approve?expectedVersion=5`), logCtx(pending.id)),
      409,
      "RESOURCE_MODIFIED",
    );
    const approved = await approveLog(
      fakeRequest(`${URL_BASE}/api/daily-logs/${pending.id}/approve?expectedVersion=0`),
      logCtx(pending.id),
    );
    expect(approved.status).toBe(200);
    expect((await db.workSession.findUniqueOrThrow({ where: { id: s.id } })).totalHours).toBe(12);

    const toReject = await db.dailyWorkLog.create({
      data: { workSessionId: s.id, date: new Date("2026-10-03"), hoursWorked: 1, status: "PENDING", source: "OPERATOR", startTime: "09:00", stopTime: "10:00" },
    });
    expect((await rejectLog(fakeRequest(`${URL_BASE}/api/daily-logs/${toReject.id}/reject`), logCtx(toReject.id))).status).toBe(200);

    await expectError(
      await deleteLog(fakeRequest(`${URL_BASE}/api/daily-logs/${logId}?expectedVersion=0`, { method: "DELETE" }), logCtx(logId)),
      409,
      "RESOURCE_MODIFIED",
    );
    const deleted = await deleteLog(fakeRequest(`${URL_BASE}/api/daily-logs/${logId}?expectedVersion=1`, { method: "DELETE" }), logCtx(logId));
    expect(deleted.status).toBe(200);
    expect((await db.workSession.findUniqueOrThrow({ where: { id: s.id } })).totalHours).toBe(2);
  });

  it("another business's reading is a 404 on every route", async () => {
    const foreignMachine = await newMachine(other);
    const foreignSession = await newActiveSession(other, foreignMachine.id);
    const foreign = ok(
      await addDailyLog(other.businessId, other.actor, {
        workSessionId: foreignSession.id,
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 104,
      }),
    );
    const pending = await db.dailyWorkLog.create({
      data: { workSessionId: foreignSession.id, date: new Date("2026-10-02"), hoursWorked: 1, status: "PENDING", source: "OPERATOR" },
    });
    const before = await db.dailyWorkLog.findUniqueOrThrow({ where: { id: foreign.logId } });

    await expectError(
      await patchLog(
        fakeRequest(`${URL_BASE}/api/daily-logs/${foreign.logId}`, { method: "PATCH", body: { date: "2026-10-01", startHourMeter: 100, endHourMeter: 130 } }),
        logCtx(foreign.logId),
      ),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await deleteLog(fakeRequest(`${URL_BASE}/api/daily-logs/${foreign.logId}`, { method: "DELETE" }), logCtx(foreign.logId)),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await approveLog(fakeRequest(`${URL_BASE}/api/daily-logs/${pending.id}/approve`), logCtx(pending.id)),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await rejectLog(fakeRequest(`${URL_BASE}/api/daily-logs/${pending.id}/reject`), logCtx(pending.id)),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await addLogRoute(
        fakeRequest(`${URL_BASE}/api/excavators/${foreignMachine.id}/daily-logs`, {
          body: { workSessionId: foreignSession.id, date: "2026-10-09", startHourMeter: 104, endHourMeter: 110 },
        }),
        idCtx(foreignMachine.id),
      ),
      404,
      "NOT_FOUND",
    );
    expect(await db.dailyWorkLog.findUniqueOrThrow({ where: { id: foreign.logId } })).toEqual(before);
    expect((await db.dailyWorkLog.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("PENDING");
  });
});

describe("machines over HTTP", () => {
  it("create, read, edit with expectedVersion, archive, and the list/detail only show this business", async () => {
    const created = await createMachineNow({ name: "Route CAT", startingHourMeter: 12.5 });
    expect(created.status).toBe(200);
    const { excavator } = (await created.json()) as { excavator: { id: string; version: number } };
    expect(excavator.version).toBe(0);

    const detail = await getMachine(new Request(`${URL_BASE}/api/excavators/${excavator.id}`), idCtx(excavator.id));
    expect(detail.status).toBe(200);
    const detailJson = (await detail.json()) as { detail: { excavator: { version: number } } };
    expect(detailJson.detail.excavator.version).toBe(0); // the edit form sends this back as expectedVersion

    const patch = (expectedVersion: number | undefined, name: string) =>
      patchMachine(
        fakeRequest(`${URL_BASE}/api/excavators/${excavator.id}`, { method: "PATCH", body: { name, expectedVersion } }),
        idCtx(excavator.id),
      );
    const edited = await patch(0, "Route CAT 2");
    expect(edited.status).toBe(200);
    expect(await edited.json()).toEqual({ ok: true, version: 1 });
    await expectError(await patch(0, "Lost update"), 409, "RESOURCE_MODIFIED");
    await expectError(
      await patchMachine(fakeRequest(`${URL_BASE}/api/excavators/${excavator.id}`, { method: "PATCH", body: { name: "" } }), idCtx(excavator.id)),
      422,
      "VALIDATION_FAILED",
    );

    const list = (await (await listMachinesNow()).json()) as { excavators: { id: string }[] };
    expect(list.excavators.some((e) => e.id === excavator.id)).toBe(true);

    await expectError(
      await archiveMachine(fakeRequest(`${URL_BASE}/api/excavators/${excavator.id}?expectedVersion=0`, { method: "DELETE" }), idCtx(excavator.id)),
      409,
      "RESOURCE_MODIFIED",
    );
    const archived = await archiveMachine(fakeRequest(`${URL_BASE}/api/excavators/${excavator.id}?expectedVersion=1`, { method: "DELETE" }), idCtx(excavator.id));
    expect(archived.status).toBe(200);
    const listAfter = (await (await listMachinesNow()).json()) as { excavators: { id: string }[] };
    expect(listAfter.excavators.some((e) => e.id === excavator.id)).toBe(false);
  });

  it("another business's machine is a 404 for read, edit, archive, site, history, start-work and service records", async () => {
    const foreign = await newMachine(other, { name: "Foreign route" });
    const before = await db.excavator.findUniqueOrThrow({ where: { id: foreign.id } });
    const ctx = idCtx(foreign.id);

    await expectError(await getMachine(new Request(`${URL_BASE}/api/excavators/${foreign.id}`), ctx), 404, "NOT_FOUND");
    await expectError(
      await patchMachine(fakeRequest(`${URL_BASE}/api/excavators/${foreign.id}`, { method: "PATCH", body: { name: "Hijacked" } }), ctx),
      404,
      "NOT_FOUND",
    );
    await expectError(await archiveMachine(fakeRequest(`${URL_BASE}/api/excavators/${foreign.id}`, { method: "DELETE" }), ctx), 404, "NOT_FOUND");
    await expectError(
      await setSite(fakeRequest(`${URL_BASE}/api/excavators/${foreign.id}/site`, { method: "PATCH", body: { siteName: "Hijack" } }), ctx),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await startWorkRoute(
        fakeRequest(`${URL_BASE}/api/excavators/${foreign.id}/start-work`, {
          body: { customerId: t.customerId, siteName: "Hijack", startDate: "2026-10-02", startHourMeter: 100 },
        }),
        ctx,
      ),
      404,
      "NOT_FOUND",
    );
    const item = await db.serviceItem.create({ data: { businessId: t.businessId, name: "Mine", category: "Other" } });
    await expectError(
      await createServiceRecordRoute(
        fakeRequest(`${URL_BASE}/api/excavators/${foreign.id}/service-records`, {
          body: { serviceDate: "2026-10-01", hourMeterAtService: 100, items: [{ serviceItemId: item.id, action: "Serviced", cost: 5 }] },
        }),
        ctx,
      ),
      404,
      "NOT_FOUND",
    );
    const history = await workHistory(new Request(`${URL_BASE}/api/excavators/${foreign.id}/work-history`), ctx);
    // 404 (not an empty 200): another tenant's id is indistinguishable from a missing one.
    await expectError(history, 404, "NOT_FOUND");

    expect(await db.excavator.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(before);
    expect(await auditRows(other.businessId, "Excavator", foreign.id)).toHaveLength(0);
  });

  it("reorder ignores ids that belong to another business (and never touches them)", async () => {
    const mine1 = await newMachine(t, { name: "Reorder 1" });
    const mine2 = await newMachine(t, { name: "Reorder 2" });
    const foreign = await newMachine(other, { name: "Reorder foreign" });
    await db.excavator.update({ where: { id: foreign.id }, data: { sortOrder: 77 } });

    const res = await reorder({ orderedIds: [mine2.id, foreign.id, mine1.id] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await db.excavator.findUniqueOrThrow({ where: { id: mine2.id } })).sortOrder).toBe(1);
    expect((await db.excavator.findUniqueOrThrow({ where: { id: mine1.id } })).sortOrder).toBe(2);
    expect(await db.excavator.findUniqueOrThrow({ where: { id: foreign.id } })).toMatchObject({ sortOrder: 77, version: 0 });

    await expectError(await reorder({ orderedIds: [] }), 422, "VALIDATION_FAILED");
  });

  it("work-history takes limit/cursor, answers { history, nextCursor }, and rejects a bad limit", async () => {
    const m = await newMachine(t);
    for (const [i, date] of ["2026-08-01", "2026-08-02", "2026-08-03"].entries()) {
      await db.workSession.create({
        data: {
          businessId: t.businessId,
          excavatorId: m.id,
          customerId: t.customerId,
          siteId: t.siteId,
          operatorId: t.operatorId,
          startDate: new Date(date),
          endDate: new Date(date),
          startHourMeter: 100 + i,
          endHourMeter: 101 + i,
          totalHours: 1,
          status: "COMPLETED",
        },
      });
    }
    const get = (query: string) => workHistory(new Request(`${URL_BASE}/api/excavators/${m.id}/work-history${query}`), idCtx(m.id));

    const first = (await (await get("?limit=2")).json()) as { history: { id: string }[]; nextCursor: string | null };
    expect(first.history).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = (await (await get(`?limit=2&cursor=${first.nextCursor}`)).json()) as { history: { id: string }[]; nextCursor: string | null };
    expect(second.history).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.history, ...second.history].map((s) => s.id)).size).toBe(3);

    // No limit (older apps): one bounded page with the same keys.
    const legacy = (await (await get("")).json()) as { history: unknown[]; nextCursor: string | null };
    expect(legacy.history).toHaveLength(3);

    await expectError(await get("?limit=0"), 400, "BAD_REQUEST");
    await expectError(await get("?from=garbage"), 422, "VALIDATION_FAILED");
  });
});

describe("service records and components over HTTP", () => {
  it("returns costs as plain numbers and rejects another business's component", async () => {
    const m = await newMachine(t);
    const itemRes = await createItem({ name: "Custom Part", category: "Other" });
    expect(itemRes.status).toBe(200);
    const { component } = (await itemRes.json()) as { component: { id: string; name: string } };
    expect(component.name).toBe("Custom Part");
    await expectError(await createItem({ name: "Bad", category: "Nonsense" }), 422, "VALIDATION_FAILED");

    const res = await createServiceRecordRoute(
      fakeRequest(`${URL_BASE}/api/excavators/${m.id}/service-records`, {
        body: {
          serviceDate: "2026-10-01",
          hourMeterAtService: 140,
          items: [
            { serviceItemId: component.id, action: "Replaced", cost: 0.1 },
            { serviceItemId: component.id, action: "Serviced", cost: 0.2 },
          ],
        },
      }),
      idCtx(m.id),
    );
    expect(res.status).toBe(200);
    const { record } = (await res.json()) as { record: { cost: number; items: { cost: number }[] } };
    expect(record.cost).toBe(0.3);
    expect(record.items.map((i) => i.cost).sort()).toEqual([0.1, 0.2]);

    const foreignItem = await db.serviceItem.create({ data: { businessId: other.businessId, name: "Foreign", category: "Other" } });
    await expectError(
      await createServiceRecordRoute(
        fakeRequest(`${URL_BASE}/api/excavators/${m.id}/service-records`, {
          body: { serviceDate: "2026-10-01", hourMeterAtService: 140, items: [{ serviceItemId: foreignItem.id, action: "Serviced", cost: 1 }] },
        }),
        idCtx(m.id),
      ),
      404,
      "NOT_FOUND",
    );
  });
});
