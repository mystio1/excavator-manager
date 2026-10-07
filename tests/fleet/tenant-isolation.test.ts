import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addDailyLog,
  approveDailyLog,
  deleteDailyLog,
  deleteWorkSession,
  listPendingLogs,
  listWorkHistory,
  rejectDailyLog,
  startWork,
  stopWork,
  submitDailyLog,
  updateDailyLog,
  updateWorkSession,
} from "@/lib/services/workSessions";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { failed, newActiveSession, newMachine, ok } from "./helpers";

/**
 * Tenant isolation for jobs and readings: business A (the caller) must never be
 * able to read, change, stop, bill-link or delete anything of business B, even
 * with B's exact ids — and B's rows must come out of every attempt untouched.
 */

let a: TestTenant;
let b: TestTenant;
let bMachine: Awaited<ReturnType<typeof newMachine>>;
let bSession: Awaited<ReturnType<typeof newActiveSession>>;
let bLogId: string;
let bPendingLogId: string;
let aMachine: Awaited<ReturnType<typeof newMachine>>;
let aSession: Awaited<ReturnType<typeof newActiveSession>>;

beforeAll(async () => {
  a = await createTenant("fleet-iso-a");
  b = await createTenant("fleet-iso-b");

  bMachine = await newMachine(b);
  bSession = await newActiveSession(b, bMachine.id);
  const approved = ok(
    await addDailyLog(b.businessId, b.actor, {
      workSessionId: bSession.id,
      date: "2026-10-01",
      startHourMeter: 100,
      endHourMeter: 108,
      dieselLiters: 30,
    }),
  );
  bLogId = approved.logId;
  const pending = await db.dailyWorkLog.create({
    data: {
      workSessionId: bSession.id,
      date: new Date("2026-10-02"),
      startHourMeter: 108,
      endHourMeter: 110,
      hoursWorked: 2,
      status: "PENDING",
      source: "OPERATOR",
    },
  });
  bPendingLogId = pending.id;

  aMachine = await newMachine(a);
  aSession = await newActiveSession(a, aMachine.id);
});

afterAll(async () => {
  await cleanupTenant(a.businessId);
  await cleanupTenant(b.businessId);
});

const body = (customerId: string, operatorId: string, over: Record<string, unknown> = {}) => ({
  customerId,
  operatorId,
  siteName: "Hijack",
  startDate: "2026-10-01",
  startHourMeter: 100,
  totalHours: 1,
  ...over,
});

describe("business A cannot touch business B's jobs and readings", () => {
  it("every write on B's ids is NOT_FOUND, and B's rows are byte-for-byte unchanged", async () => {
    const sessionBefore = await db.workSession.findUniqueOrThrow({ where: { id: bSession.id } });
    const logBefore = await db.dailyWorkLog.findUniqueOrThrow({ where: { id: bLogId } });
    const pendingBefore = await db.dailyWorkLog.findUniqueOrThrow({ where: { id: bPendingLogId } });
    const machineBefore = await db.excavator.findUniqueOrThrow({ where: { id: bMachine.id } });

    const attempts = [
      await updateWorkSession(a.businessId, a.actor, bSession.id, body(a.customerId, a.operatorId)),
      await deleteWorkSession(a.businessId, a.actor, bSession.id),
      await stopWork(a.businessId, a.actor, { workSessionId: bSession.id, endDate: "2026-10-05", endHourMeter: 130 }),
      await addDailyLog(a.businessId, a.actor, { workSessionId: bSession.id, date: "2026-10-09", startHourMeter: 110, endHourMeter: 120 }),
      await updateDailyLog(a.businessId, a.actor, bLogId, { date: "2026-10-01", startHourMeter: 100, endHourMeter: 140 }),
      await deleteDailyLog(a.businessId, a.actor, bLogId),
      await approveDailyLog(a.businessId, a.actor, bPendingLogId),
      await rejectDailyLog(a.businessId, a.actor, bPendingLogId),
      await startWork(a.businessId, a.actor, {
        excavatorId: bMachine.id,
        customerId: a.customerId,
        siteName: "Hijack",
        startDate: "2026-10-05",
        startHourMeter: 100,
      }),
    ];
    for (const attempt of attempts) expect(failed(attempt).code).toBe("NOT_FOUND");

    expect(await db.workSession.findUniqueOrThrow({ where: { id: bSession.id } })).toEqual(sessionBefore);
    expect(await db.dailyWorkLog.findUniqueOrThrow({ where: { id: bLogId } })).toEqual(logBefore);
    expect(await db.dailyWorkLog.findUniqueOrThrow({ where: { id: bPendingLogId } })).toEqual(pendingBefore);
    expect(await db.excavator.findUniqueOrThrow({ where: { id: bMachine.id } })).toEqual(machineBefore);
    // Nothing was audited in either tenant for the refused attempts.
    expect(await db.auditLog.count({ where: { businessId: a.businessId, entityId: { in: [bSession.id, bLogId, bPendingLogId] } } })).toBe(0);
  });

  it("A's own job cannot be re-pointed at B's customer or B's operator", async () => {
    const withForeignCustomer = failed(await updateWorkSession(a.businessId, a.actor, aSession.id, body(b.customerId, a.operatorId)));
    expect(withForeignCustomer).toMatchObject({ code: "NOT_FOUND", error: "Customer not found" });
    const withForeignOperator = failed(await updateWorkSession(a.businessId, a.actor, aSession.id, body(a.customerId, b.operatorId)));
    expect(withForeignOperator).toMatchObject({ code: "NOT_FOUND", error: "Operator not found" });

    const startOnOwnMachineForeignCustomer = failed(
      await startWork(a.businessId, a.actor, {
        excavatorId: aMachine.id,
        customerId: b.customerId,
        siteName: "Site",
        startDate: "2026-10-05",
        startHourMeter: 100,
      }),
    );
    expect(startOnOwnMachineForeignCustomer.code).toBe("NOT_FOUND");

    const untouched = await db.workSession.findUniqueOrThrow({ where: { id: aSession.id } });
    expect(untouched).toMatchObject({ customerId: a.customerId, operatorId: a.operatorId, version: 0 });
    expect(await db.workSession.count({ where: { excavatorId: aMachine.id } })).toBe(1);
  });

  it("history and the pending-approvals list only ever show the caller's own data", async () => {
    expect((await listWorkHistory(a.businessId, bMachine.id)).history).toEqual([]);
    const mine = await listWorkHistory(a.businessId, aMachine.id);
    expect(mine.history.map((s) => s.id)).toEqual([aSession.id]);

    const pendingForA = await listPendingLogs(a.businessId);
    expect(pendingForA.some((l) => l.id === bPendingLogId)).toBe(false);
    const pendingForB = await listPendingLogs(b.businessId);
    expect(pendingForB.some((l) => l.id === bPendingLogId)).toBe(true);
  });

  it("an operator can only submit readings to jobs of THEIR OWN business", async () => {
    // A's operator, B's job (even though B's machine is paired with B's operator, not A's).
    const result = failed(
      await submitDailyLog(a.operatorId, { workSessionId: bSession.id, date: "2026-10-07", startHourMeter: 110, endHourMeter: 112 }),
    );
    expect(result.code).toBe("NOT_FOUND");
    expect(await db.dailyWorkLog.count({ where: { workSessionId: bSession.id } })).toBe(2);
  });
});
