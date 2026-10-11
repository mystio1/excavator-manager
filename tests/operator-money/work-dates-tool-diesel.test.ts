import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditActor } from "@/lib/audit";
import { db } from "@/lib/db";
import { TOOL_REQUIRED_MESSAGE } from "@/lib/attachments";
import { assignOperator } from "@/lib/services/operatorAssignments";
import {
  approveWorkRequest,
  editOperatorWorkRequest,
  endOperatorWork,
  startOperatorWork,
} from "@/lib/services/operatorWorkRequests";
import {
  addDailyLog,
  approveDailyLog,
  deleteDailyLog,
  rejectDailyLog,
  startWork,
  stopWork,
  submitDailyLog,
  submitDieselOnly,
  updateDailyLog,
} from "@/lib/services/workSessions";
import { createBill } from "@/lib/services/bills";
import {
  approveWorkRequestBodySchema,
  editOperatorWorkRequestSchema,
  endOperatorWorkSchema,
  startOperatorWorkSchema,
} from "@/lib/validation/operatorWorkRequest";
import { dailyLogSchema, dieselOnlySchema, operatorDailyLogSchema } from "@/lib/validation/workSession";
import { billInput, ok as billOk } from "../bills/helpers";
import { cleanupTenant, createCompletedSession, createTenant, fakeRequest, type TestTenant } from "../helpers/tenant";

/**
 * Operator submissions: (R1) the tool is compulsory on every operator path
 * and stays optional for admins; (R2) the date the work was DONE is stored as
 * the work date, apart from when it was submitted, and flows to the session
 * and the bill; (R3) "Diesel only" entries.
 */

const auth = vi.hoisted(() => ({
  operator: null as null | { businessId: string; operatorId: string; operatorLang: string },
}));

vi.mock("@/lib/api-auth", () => ({
  requireOperatorApi: async () => {
    const s = auth.operator;
    if (!s) return { session: null, error: Response.json({ error: "Please log in again.", code: "UNAUTHORIZED" }, { status: 401 }) };
    return {
      session: { ...s, businessFrozen: false },
      actor: { type: "OPERATOR", id: s.operatorId, name: `operator:${s.operatorId}` },
      error: null,
    };
  },
}));

import { POST as routeStart } from "@/app/api/operator/work/start/route";
import { POST as routeEnd } from "@/app/api/operator/work/end/route";
import { POST as routeEdit } from "@/app/api/operator/work/edit/route";
import { POST as routeDailyLog } from "@/app/api/operator/daily-log/route";
import { POST as routeDiesel } from "@/app/api/operator/diesel/route";

function ok<T>(result: T): Exclude<T, { error: string }> {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`expected success, got ${JSON.stringify(result)}`);
  }
  return result as Exclude<T, { error: string }>;
}

const BASE = "https://app.example.test";
const post = (handler: (req: Request, ctx: undefined) => Promise<Response>, path: string, body: unknown) =>
  handler(fakeRequest(`${BASE}${path}`, { body }), undefined);

const operatorActor = (tenant: TestTenant): AuditActor => ({
  type: "OPERATOR",
  id: tenant.operatorId,
  name: `operator:${tenant.operatorId}`,
});

let t: TestTenant;
const extra: TestTenant[] = [];

async function assign(tenant: TestTenant) {
  ok(await assignOperator(tenant.businessId, tenant.actor, { excavatorId: tenant.excavatorId, operatorId: tenant.operatorId }));
}
async function newTenant(label: string) {
  const tenant = await createTenant(label);
  extra.push(tenant);
  return tenant;
}

beforeAll(async () => {
  t = await createTenant("wdtd");
  await assign(t);
});

beforeEach(() => {
  auth.operator = { businessId: t.businessId, operatorId: t.operatorId, operatorLang: "en" };
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  for (const tenant of extra) await cleanupTenant(tenant.businessId);
});

describe("R1: the tool is compulsory for operators, optional for admins", () => {
  const startBody = { startHourMeter: 10, startDate: "2026-08-06" };

  it("operator schemas require a known tool with a clear message", () => {
    const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
      r.success ? [] : r.error!.issues.map((i) => i.message);

    expect(messages(startOperatorWorkSchema.safeParse(startBody))).toContain(TOOL_REQUIRED_MESSAGE);
    expect(messages(startOperatorWorkSchema.safeParse({ ...startBody, attachment: "" }))).toContain(TOOL_REQUIRED_MESSAGE);
    expect(messages(startOperatorWorkSchema.safeParse({ ...startBody, attachment: "Shovel" }))).toContain(TOOL_REQUIRED_MESSAGE);
    expect(startOperatorWorkSchema.safeParse({ ...startBody, attachment: "Breaker" }).success).toBe(true);

    expect(messages(editOperatorWorkRequestSchema.safeParse({ requestId: "r", startHourMeter: 1 }))).toContain(TOOL_REQUIRED_MESSAGE);
    expect(editOperatorWorkRequestSchema.safeParse({ requestId: "r", startHourMeter: 1, attachment: "Chaining" }).success).toBe(true);

    const approve = { siteName: "S", startHourMeter: 1, endHourMeter: 2, customerId: "c" };
    expect(messages(approveWorkRequestBodySchema.safeParse(approve))).toContain(TOOL_REQUIRED_MESSAGE);
    expect(approveWorkRequestBodySchema.safeParse({ ...approve, attachment: "Bucket" }).success).toBe(true);

    const reading = { workSessionId: "s", date: "2026-10-01", startHourMeter: 1, endHourMeter: 2 };
    expect(messages(operatorDailyLogSchema.safeParse(reading))).toContain(TOOL_REQUIRED_MESSAGE);
    expect(operatorDailyLogSchema.safeParse({ ...reading, attachment: "Bucket" }).success).toBe(true);
    // The admin reading schema is unchanged: still optional.
    expect(dailyLogSchema.safeParse(reading).success).toBe(true);

    // End: the tool is optional in the body (required only when none was recorded).
    expect(endOperatorWorkSchema.safeParse({ requestId: "r", endHourMeter: 5 }).success).toBe(true);
    expect(messages(endOperatorWorkSchema.safeParse({ requestId: "r", endHourMeter: 5, attachment: "x" }))).toContain(TOOL_REQUIRED_MESSAGE);
  });

  it("operator routes answer 422 with the message when no tool is chosen", async () => {
    const start = await post(routeStart, "/api/operator/work/start", startBody);
    expect(start.status).toBe(422);
    const json = await start.json();
    expect(json.code).toBe("VALIDATION_FAILED");
    expect(json.error).toBe(TOOL_REQUIRED_MESSAGE);

    const edit = await post(routeEdit, "/api/operator/work/edit", { requestId: "x", startHourMeter: 1 });
    expect(edit.status).toBe(422);
    expect((await edit.json()).error).toBe(TOOL_REQUIRED_MESSAGE);

    const log = await post(routeDailyLog, "/api/operator/daily-log", {
      workSessionId: "x",
      date: "2026-10-01",
      startHourMeter: 1,
      endHourMeter: 2,
    });
    expect(log.status).toBe(422);
    expect((await log.json()).error).toBe(TOOL_REQUIRED_MESSAGE);
  });

  it("end needs a tool only when none was ever recorded", async () => {
    // A legacy ACTIVE request with no tool.
    const legacy = await db.operatorWorkRequest.create({
      data: { businessId: t.businessId, excavatorId: t.excavatorId, operatorId: t.operatorId, startDate: new Date("2026-08-01"), startHourMeter: 10, status: "ACTIVE" },
    });
    const refused = await endOperatorWork(t.businessId, t.operatorId, operatorActor(t), { requestId: legacy.id, endHourMeter: 20 });
    expect(refused).toMatchObject({ code: "VALIDATION_FAILED", error: TOOL_REQUIRED_MESSAGE });
    expect((await db.operatorWorkRequest.findUniqueOrThrow({ where: { id: legacy.id } })).status).toBe("ACTIVE");

    const accepted = ok(await endOperatorWork(t.businessId, t.operatorId, operatorActor(t), { requestId: legacy.id, endHourMeter: 20, attachment: "Breaker" }));
    expect(accepted.request).toMatchObject({ status: "PENDING", attachment: "Breaker" });

    // A request that already has a tool ends without resending it.
    const started = ok(await startOperatorWork(t.businessId, t.operatorId, operatorActor(t), { startHourMeter: 30, startDate: "2026-08-02", attachment: "Bucket" }));
    const ended = ok(await endOperatorWork(t.businessId, t.operatorId, operatorActor(t), { requestId: started.request.id, endHourMeter: 40 }));
    expect(ended.request.attachment).toBe("Bucket");
  });

  it("an existing PENDING request without a tool is approvable once the admin picks one", async () => {
    const legacy = await db.operatorWorkRequest.create({
      data: {
        businessId: t.businessId, excavatorId: t.excavatorId, operatorId: t.operatorId,
        startDate: new Date("2026-08-03"), startHourMeter: 50, endDate: new Date("2026-08-03"), endHourMeter: 58, status: "PENDING",
      },
    });
    const body = { siteName: "Legacy", startHourMeter: 50, endHourMeter: 58, customerId: t.customerId };
    expect(approveWorkRequestBodySchema.safeParse(body).success).toBe(false);
    const parsed = approveWorkRequestBodySchema.parse({ ...body, attachment: "Chaining" });
    const { session } = ok(await approveWorkRequest(t.businessId, t.actor, { ...parsed, requestId: legacy.id }));
    expect(session).toMatchObject({ attachment: "Chaining", totalHours: 8 });
    // The legacy request had no submittedAt: createdAt stands in for it.
    expect(session.submittedAt?.getTime()).toBe(legacy.createdAt.getTime());
  });

  it("the operator reading service refuses a missing tool; the admin one does not need it", async () => {
    // Re-point the operator at another machine only for the reading (restored below).
    await db.excavator.update({ where: { id: t.excavatorId }, data: { currentOperatorId: null } });
    const machine = await db.excavator.create({ data: { businessId: t.businessId, name: "Reading JCB", machineNumber: "R-1", currentOperatorId: t.operatorId } });
    try {
      const s = ok(await startWork(t.businessId, t.actor, { excavatorId: machine.id, customerId: t.customerId, siteName: "S", startDate: "2026-10-01", startHourMeter: 100 }));
      const missing = await submitDailyLog(t.operatorId, { workSessionId: s.session.id, date: "2026-10-02", startHourMeter: 100, endHourMeter: 104 });
      expect(missing).toMatchObject({ code: "VALIDATION_FAILED", error: TOOL_REQUIRED_MESSAGE });
      const submitted = ok(await submitDailyLog(t.operatorId, { workSessionId: s.session.id, date: "2026-10-02", startHourMeter: 100, endHourMeter: 104, attachment: "Bucket" }));
      expect(submitted.hoursWorked).toBe(4);
      // Admin add stays optional.
      const added = ok(await addDailyLog(t.businessId, t.actor, { workSessionId: s.session.id, date: "2026-10-03", startHourMeter: 104, endHourMeter: 106 }));
      expect(added.hoursWorked).toBe(2);
    } finally {
      await db.dailyWorkLog.deleteMany({ where: { workSession: { excavatorId: machine.id } } });
      await db.workSession.deleteMany({ where: { excavatorId: machine.id } });
      await db.excavator.delete({ where: { id: machine.id } });
      await db.excavator.update({ where: { id: t.excavatorId }, data: { currentOperatorId: t.operatorId } });
    }
  });
});

describe("R2: work date vs submission time", () => {
  it("rejects a work date in the future and accepts a past one", () => {
    const tomorrow2 = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const base = { startHourMeter: 1, attachment: "Bucket" };
    expect(startOperatorWorkSchema.safeParse({ ...base, startDate: tomorrow2 }).success).toBe(false);
    expect(startOperatorWorkSchema.safeParse({ ...base, startDate: "2026-08-06" }).success).toBe(true);
    expect(startOperatorWorkSchema.safeParse(base).success).toBe(false); // the work date is required
    expect(endOperatorWorkSchema.safeParse({ requestId: "r", endHourMeter: 2, endDate: tomorrow2 }).success).toBe(false);
  });

  it("start stores the entered work date (not now); diesel date defaults to it; end stores end date + submittedAt", async () => {
    const { request } = ok(
      await startOperatorWork(t.businessId, t.operatorId, operatorActor(t), {
        startHourMeter: 100, startDate: "2026-08-06", attachment: "Bucket", dieselLiters: 20,
      }),
    );
    expect(request.startDate.toISOString()).toBe("2026-08-06T00:00:00.000Z");
    expect(request.dieselDate?.toISOString()).toBe("2026-08-06T00:00:00.000Z");
    expect(request.submittedAt).toBeNull();
    expect(Date.now() - request.createdAt.getTime()).toBeLessThan(60_000);

    // An explicit diesel date is kept.
    const explicit = ok(
      await startOperatorWork(t.businessId, t.operatorId, operatorActor(t), {
        startHourMeter: 100, startDate: "2026-08-06", attachment: "Bucket", dieselLiters: 5, dieselDate: "2026-08-05",
      }),
    );
    expect(explicit.request.dieselDate?.toISOString()).toBe("2026-08-05T00:00:00.000Z");

    const ended = ok(await endOperatorWork(t.businessId, t.operatorId, operatorActor(t), { requestId: request.id, endHourMeter: 108 }));
    expect(ended.request.endDate?.toISOString()).toBe("2026-08-06T00:00:00.000Z"); // defaults to the work date
    expect(ended.request.submittedAt).not.toBeNull();
    expect(Date.now() - ended.request.submittedAt!.getTime()).toBeLessThan(60_000);

    const before = await endOperatorWork(t.businessId, t.operatorId, operatorActor(t), { requestId: explicit.request.id, endHourMeter: 110, endDate: "2026-08-04" });
    expect(before).toMatchObject({ code: "VALIDATION_FAILED" });
    const later = ok(await endOperatorWork(t.businessId, t.operatorId, operatorActor(t), { requestId: explicit.request.id, endHourMeter: 110, endDate: "2026-08-07" }));
    expect(later.request.endDate?.toISOString()).toBe("2026-08-07T00:00:00.000Z");
  });

  it("edit can change the work dates", async () => {
    const { request } = ok(await startOperatorWork(t.businessId, t.operatorId, operatorActor(t), { startHourMeter: 200, startDate: "2026-08-06", attachment: "Bucket" }));
    ok(await endOperatorWork(t.businessId, t.operatorId, operatorActor(t), { requestId: request.id, endHourMeter: 208 }));
    const edited = ok(
      await editOperatorWorkRequest(t.businessId, t.operatorId, operatorActor(t), {
        requestId: request.id, startHourMeter: 200, endHourMeter: 208, startDate: "2026-08-05", endDate: "2026-08-06", attachment: "Bucket",
      }),
    );
    expect(edited.request.startDate.toISOString()).toBe("2026-08-05T00:00:00.000Z");
    expect(edited.request.endDate?.toISOString()).toBe("2026-08-06T00:00:00.000Z");
  });

  it("approval creates the session with the WORK dates + submittedAt, and the bill shows the work dates", async () => {
    // Work done 6 Aug, submitted now (the real submission moment is "today").
    const { request } = ok(await startOperatorWork(t.businessId, t.operatorId, operatorActor(t), { startHourMeter: 300, startDate: "2026-08-06", attachment: "Bucket", siteName: "Dated Site" }));
    const ended = ok(await endOperatorWork(t.businessId, t.operatorId, operatorActor(t), { requestId: request.id, endHourMeter: 306 }));

    const input = approveWorkRequestBodySchema.parse({ customerId: t.customerId, siteName: "Dated Site", startHourMeter: 300, endHourMeter: 306, attachment: "Bucket" });
    const { session } = ok(await approveWorkRequest(t.businessId, t.actor, { ...input, requestId: request.id }));
    expect(session.startDate.toISOString()).toBe("2026-08-06T00:00:00.000Z");
    expect(session.endDate?.toISOString()).toBe("2026-08-06T00:00:00.000Z");
    expect(session.submittedAt?.getTime()).toBe(ended.request.submittedAt!.getTime());
    expect(session.submittedAt!.toISOString().slice(0, 10)).not.toBe("2026-08-06");

    const { bill } = billOk(await createBill(t.businessId, t.actor, billInput(t, [session.id], { billNumber: `WD-${Date.now()}` })));
    const items = await db.billItem.findMany({ where: { billId: bill.id } });
    expect(items).toHaveLength(1);
    expect(items[0].fromDate.toISOString()).toBe("2026-08-06T00:00:00.000Z");
    expect(items[0].toDate.toISOString()).toBe("2026-08-06T00:00:00.000Z");
  });

  it("the admin can correct the work dates on approval (and a bad range is refused)", async () => {
    const { request } = ok(await startOperatorWork(t.businessId, t.operatorId, operatorActor(t), { startHourMeter: 400, startDate: "2026-08-06", attachment: "Bucket" }));
    ok(await endOperatorWork(t.businessId, t.operatorId, operatorActor(t), { requestId: request.id, endHourMeter: 405 }));
    const base = { customerId: t.customerId, siteName: "S", startHourMeter: 400, endHourMeter: 405, attachment: "Bucket" };
    expect(approveWorkRequestBodySchema.safeParse({ ...base, startDate: "2026-08-07", endDate: "2026-08-06" }).success).toBe(false);
    const parsed = approveWorkRequestBodySchema.parse({ ...base, startDate: "2026-08-04", endDate: "2026-08-05" });
    const { session } = ok(await approveWorkRequest(t.businessId, t.actor, { ...parsed, requestId: request.id }));
    expect(session.startDate.toISOString()).toBe("2026-08-04T00:00:00.000Z");
    expect(session.endDate?.toISOString()).toBe("2026-08-05T00:00:00.000Z");
  });
});

describe("R3: diesel only", () => {
  const diesel = (date: string, litres = 40, over: Record<string, unknown> = {}) =>
    dieselOnlySchema.parse({ dieselLiters: litres, date, ...over });

  it("validates: litres > 0, a date that is not in the future, tool optional but known", () => {
    expect(dieselOnlySchema.safeParse({ dieselLiters: 0, date: "2026-10-01" }).success).toBe(false);
    expect(dieselOnlySchema.safeParse({ date: "2026-10-01" }).success).toBe(false);
    expect(dieselOnlySchema.safeParse({ dieselLiters: 5 }).success).toBe(false);
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(dieselOnlySchema.safeParse({ dieselLiters: 5, date: future }).success).toBe(false);
    expect(dieselOnlySchema.safeParse({ dieselLiters: 5, date: "2026-10-01" }).success).toBe(true);
    expect(dieselOnlySchema.safeParse({ dieselLiters: 5, date: "2026-10-01", attachment: "Breaker", notes: "n" }).success).toBe(true);
    expect(dieselOnlySchema.safeParse({ dieselLiters: 5, date: "2026-10-01", attachment: "Spade" }).success).toBe(false);
  });

  it("a machine with no work at all: a clear 4xx, nothing written", async () => {
    const lone = await newTenant("diesel-none");
    await assign(lone);
    const result = await submitDieselOnly(lone.operatorId, diesel("2026-10-01"));
    expect(result).toMatchObject({ code: "NOT_FOUND", error: "No previous work found for this machine" });
    expect(await db.dailyWorkLog.count({ where: { workSession: { businessId: lone.businessId } } })).toBe(0);

    auth.operator = { businessId: lone.businessId, operatorId: lone.operatorId, operatorLang: "en" };
    const res = await post(routeDiesel, "/api/operator/diesel", { dieselLiters: 10, date: "2026-10-01" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("No previous work found for this machine");
  });

  it("an operator without a machine is FORBIDDEN", async () => {
    const lone = await newTenant("diesel-unassigned");
    expect(await submitDieselOnly(lone.operatorId, diesel("2026-10-01"))).toMatchObject({ code: "FORBIDDEN" });
  });

  it("attaches to the latest (completed) job with start = end = the previous ending reading; approval adds only litres", async () => {
    const d = await newTenant("diesel-completed");
    await assign(d);
    const s = await createCompletedSession(d, { totalHours: 8 }); // meter 100 -> 108, 8 h
    await db.excavator.update({ where: { id: d.excavatorId }, data: { currentHourMeter: 108 } });

    auth.operator = { businessId: d.businessId, operatorId: d.operatorId, operatorLang: "en" };
    const res = await post(routeDiesel, "/api/operator/diesel", { dieselLiters: "40", date: "2026-10-05", notes: "tanker" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ workSessionId: s.id, dieselLiters: 40, hoursWorked: 0 });

    const log = await db.dailyWorkLog.findUniqueOrThrow({ where: { id: json.logId } });
    expect(log).toMatchObject({
      kind: "DIESEL_ONLY", status: "PENDING", source: "OPERATOR", hoursWorked: 0,
      startHourMeter: 108, endHourMeter: 108, dieselLiters: 40, attachment: null, notes: "tanker",
    });
    expect(log.date.toISOString()).toBe("2026-10-05T00:00:00.000Z");

    // Pending: nothing official has moved.
    expect(await db.workSession.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ dieselLiters: null, totalHours: 8 });

    ok(await approveDailyLog(d.businessId, d.actor, log.id));
    const after = await db.workSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(after).toMatchObject({ dieselLiters: 40, totalHours: 8, endHourMeter: 108, status: "COMPLETED", attachment: null });
    expect(after.dieselDate?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect((await db.excavator.findUniqueOrThrow({ where: { id: d.excavatorId } })).currentHourMeter).toBe(108);

    // Billing is unaffected: still 8 hours, and the bill shows the work dates.
    const { bill } = billOk(await createBill(d.businessId, d.actor, billInput(d, [s.id], { billNumber: `DO-${Date.now()}` })));
    const items = await db.billItem.findMany({ where: { billId: bill.id } });
    expect(Number(items[0].hours)).toBe(8);

    // Removing the diesel entry unwinds only the litres.
    ok(await deleteDailyLog(d.businessId, d.actor, log.id));
    expect(await db.workSession.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ dieselLiters: 0, totalHours: 8 });
    expect((await db.excavator.findUniqueOrThrow({ where: { id: d.excavatorId } })).currentHourMeter).toBe(108);
  });

  it("rejecting leaves the job untouched, and the same date can then be resubmitted", async () => {
    const d = await newTenant("diesel-reject");
    await assign(d);
    const s = await createCompletedSession(d, { totalHours: 8 });
    const first = ok(await submitDieselOnly(d.operatorId, diesel("2026-10-05", 15)));
    ok(await rejectDailyLog(d.businessId, d.actor, first.logId));
    expect(await db.workSession.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ dieselLiters: null, totalHours: 8 });
    const again = ok(await submitDieselOnly(d.operatorId, diesel("2026-10-05", 16)));
    expect(again.logId).not.toBe(first.logId);
  });

  it("an ACTIVE job wins over a newer completed one; a second entry for the same date is a 409 (unique index)", async () => {
    const d = await newTenant("diesel-active");
    await assign(d);
    await createCompletedSession(d, { totalHours: 4 });
    const active = ok(await startWork(d.businessId, d.actor, { excavatorId: d.excavatorId, customerId: d.customerId, siteName: "Live", startDate: "2026-09-01", startHourMeter: 104 })).session;

    const first = ok(await submitDieselOnly(d.operatorId, diesel("2026-10-06", 20)));
    expect(first.workSessionId).toBe(active.id);

    const dup = await submitDieselOnly(d.operatorId, diesel("2026-10-06", 5));
    expect(dup).toMatchObject({ code: "CONFLICT", error: "A diesel entry for this date is already submitted" });

    // A day that already has a work reading: tell the operator to use that reading.
    ok(await addDailyLog(d.businessId, d.actor, { workSessionId: active.id, date: "2026-10-07", startHourMeter: 104, endHourMeter: 110 }));
    const onWorkDay = await submitDieselOnly(d.operatorId, diesel("2026-10-07", 5));
    expect(onWorkDay).toMatchObject({ code: "CONFLICT" });
    expect((onWorkDay as { error: string }).error).toContain("add the diesel to that day's reading");

    // The reverse is the existing duplicate-day rule: a work reading on a diesel-only day is refused.
    const reverse = await addDailyLog(d.businessId, d.actor, { workSessionId: active.id, date: "2026-10-06", startHourMeter: 110, endHourMeter: 112 });
    expect(reverse).toMatchObject({ code: "CONFLICT" });
  });

  it("diesel-only entries never count as readings: hours and the meter stay put, and stopping the job still bills the meter hours", async () => {
    const d = await newTenant("diesel-hours");
    await assign(d);
    const active = ok(await startWork(d.businessId, d.actor, { excavatorId: d.excavatorId, customerId: d.customerId, siteName: "Live", startDate: "2026-10-01", startHourMeter: 100 })).session;

    const entry = ok(await submitDieselOnly(d.operatorId, diesel("2026-10-02", 30)));
    ok(await approveDailyLog(d.businessId, d.actor, entry.logId));
    const mid = await db.workSession.findUniqueOrThrow({ where: { id: active.id } });
    expect(mid).toMatchObject({ totalHours: 0, dieselLiters: 30 });
    expect((await db.excavator.findUniqueOrThrow({ where: { id: d.excavatorId } })).currentHourMeter).toBe(100);

    // Admin correction of the diesel-only entry follows into the job's diesel total, hours still 0.
    ok(await updateDailyLog(d.businessId, d.actor, entry.logId, { kind: "DIESEL_ONLY", date: "2026-10-02", dieselLiters: 45 }));
    expect(await db.workSession.findUniqueOrThrow({ where: { id: active.id } })).toMatchObject({ totalHours: 0, dieselLiters: 45 });
    expect(await updateDailyLog(d.businessId, d.actor, entry.logId, { kind: "DIESEL_ONLY", date: "2026-10-02" })).toMatchObject({ code: "VALIDATION_FAILED" });

    const stopped = ok(await stopWork(d.businessId, d.actor, { workSessionId: active.id, endDate: "2026-10-03", endHourMeter: 108 }));
    expect(stopped.totalHours).toBe(8); // from the meter, not the (zero-hour) diesel entry
  });
});
