import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addDailyLog,
  approveDailyLog,
  deleteDailyLog,
  listPendingLogs,
  rejectDailyLog,
  submitDailyLog,
  updateDailyLog,
} from "@/lib/services/workSessions";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { auditRows, failed, newActiveSession, newMachine, ok, snapshot } from "./helpers";

/**
 * Daily readings: adding / editing / deleting / approving / rejecting a reading
 * must keep the job's totalHours + diesel and the machine's meter in step,
 * move every touched row's version, and leave an audit row with before/after.
 */

let t: TestTenant;

beforeAll(async () => {
  t = await createTenant("fleet-logs");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
});

const session = (id: string) => db.workSession.findUniqueOrThrow({ where: { id } });
const machine = (id: string) => db.excavator.findUniqueOrThrow({ where: { id } });
const log = (id: string) => db.dailyWorkLog.findUniqueOrThrow({ where: { id } });

/** machine (meter 100) + ACTIVE job + two approved days: 100->108 (8 h, 40 L) and 108->112 (4 h, 20 L). */
async function jobWithTwoDays() {
  const m = await newMachine(t);
  const s = await newActiveSession(t, m.id);
  const a = ok(
    await addDailyLog(t.businessId, t.actor, {
      workSessionId: s.id,
      date: "2026-10-01",
      startHourMeter: 100,
      endHourMeter: 108,
      dieselLiters: 40,
    }),
  );
  const b = ok(
    await addDailyLog(t.businessId, t.actor, {
      workSessionId: s.id,
      date: "2026-10-02",
      startHourMeter: 108,
      endHourMeter: 112,
      dieselLiters: 20,
    }),
  );
  return { m, s, a, b };
}

describe("addDailyLog (admin)", () => {
  it("auto-approves, rolls hours/diesel into the job, follows the meter, bumps versions, and is audited", async () => {
    const m = await newMachine(t);
    const s = await newActiveSession(t, m.id);

    const added = ok(
      await addDailyLog(t.businessId, t.actor, {
        workSessionId: s.id,
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 108.5,
        dieselLiters: 40,
        attachment: "Breaker",
      }),
    );
    expect(added.hoursWorked).toBe(8.5);
    expect(added.version).toBe(0);

    const stored = await log(added.logId);
    expect(stored).toMatchObject({ status: "APPROVED", source: "ADMIN", hoursWorked: 8.5, version: 0 });

    // ONE write to the job for everything this reading changed.
    const job = await session(s.id);
    expect(job).toMatchObject({ totalHours: 8.5, dieselLiters: 40, attachment: "Breaker", version: 1 });
    const mach = await machine(m.id);
    expect(mach).toMatchObject({ currentHourMeter: 108.5, version: m.version + 1 });

    const rows = await auditRows(t.businessId, "DailyWorkLog", added.logId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "dailyLog.add", actorType: "OWNER", actorId: t.userId });
    expect(snapshot(rows[0].after)).toMatchObject({ hoursWorked: 8.5, status: "APPROVED" });
    const details = rows[0].details as { sessionTotalHours: { from: number; to: number }; excavatorMeter: { from: number; to: number } };
    expect(details.sessionTotalHours).toEqual({ from: 0, to: 8.5 });
    expect(details.excavatorMeter).toEqual({ from: 100, to: 108.5 });
  });

  it("derives hours from clock time minus break, and rounds to 2 dp", async () => {
    const m = await newMachine(t);
    const s = await newActiveSession(t, m.id);
    const added = ok(
      await addDailyLog(t.businessId, t.actor, {
        workSessionId: s.id,
        date: "2026-10-01",
        startTime: "08:00",
        stopTime: "17:20",
        breakMinutes: 45,
        dieselLiters: 12.345,
      }),
    );
    expect(added.hoursWorked).toBe(8.58); // 08:00-17:20 = 560 min, minus the 45 min break = 515 min = 8.5833 h
    expect((await session(s.id)).dieselLiters).toBe(12.35);
  });

  it("refuses a second reading for the same day, a zero-hour reading, and a job that is not this machine's", async () => {
    const m = await newMachine(t);
    const s = await newActiveSession(t, m.id);
    const base = { workSessionId: s.id, date: "2026-10-01", startHourMeter: 100, endHourMeter: 104 };
    ok(await addDailyLog(t.businessId, t.actor, base));

    expect(failed(await addDailyLog(t.businessId, t.actor, base)).code).toBe("CONFLICT");
    expect(
      failed(
        await addDailyLog(t.businessId, t.actor, {
          workSessionId: s.id,
          date: "2026-10-02",
          startTime: "09:00",
          stopTime: "09:30",
          breakMinutes: 30,
        }),
      ).code,
    ).toBe("VALIDATION_FAILED");

    const other = await newMachine(t, { name: "Other" });
    const pinned = failed(
      await addDailyLog(t.businessId, t.actor, { ...base, date: "2026-10-03" }, { excavatorId: other.id }),
    );
    expect(pinned.code).toBe("NOT_FOUND");
    expect(await db.dailyWorkLog.count({ where: { workSessionId: s.id } })).toBe(1);
  });
});

describe("updateDailyLog", () => {
  it("recomputes the job's totalHours and diesel and follows the machine's meter, moving every version", async () => {
    const { m, s, a, b } = await jobWithTwoDays();
    const jobBefore = await session(s.id);
    expect(jobBefore).toMatchObject({ totalHours: 12, dieselLiters: 60 });
    const machineBefore = await machine(m.id);
    expect(machineBefore.currentHourMeter).toBe(112);

    // Correct the FIRST day: 100 -> 110 (10 h) and 50 L. The latest reading is
    // still day 2, so the machine's meter stays where it was.
    const first = ok(
      await updateDailyLog(t.businessId, t.actor, a.logId, {
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 110,
        dieselLiters: 50,
        expectedVersion: a.version,
      }),
    );
    expect(first.hoursWorked).toBe(10);
    expect(first.version).toBe(a.version + 1);

    const job1 = await session(s.id);
    expect(job1).toMatchObject({ totalHours: 14, dieselLiters: 70 });
    expect(job1.version).toBe(jobBefore.version + 1);
    expect(await machine(m.id)).toMatchObject({ currentHourMeter: 112, version: machineBefore.version });

    // Correct the LATEST day's end meter: the machine follows (and its version moves).
    ok(
      await updateDailyLog(t.businessId, t.actor, b.logId, {
        date: "2026-10-02",
        startHourMeter: 108,
        endHourMeter: 115,
        dieselLiters: 20,
      }),
    );
    expect(await session(s.id)).toMatchObject({ totalHours: 17, dieselLiters: 70, version: job1.version + 1 });
    expect(await machine(m.id)).toMatchObject({ currentHourMeter: 115, version: machineBefore.version + 1 });
  });

  it("rejects a stale expectedVersion with RESOURCE_MODIFIED and changes nothing", async () => {
    const { s, a } = await jobWithTwoDays();
    ok(
      await updateDailyLog(t.businessId, t.actor, a.logId, {
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 109,
        expectedVersion: 0,
      }),
    );
    const jobAfterFirst = await session(s.id);

    const stale = failed(
      await updateDailyLog(t.businessId, t.actor, a.logId, {
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 120,
        expectedVersion: 0, // the form still holds the old version
      }),
    );
    expect(stale.code).toBe("RESOURCE_MODIFIED");
    expect(stale.error).toMatch(/reload/i);
    expect((await log(a.logId)).endHourMeter).toBe(109);
    expect(await session(s.id)).toMatchObject({ totalHours: jobAfterFirst.totalHours, version: jobAfterFirst.version });
  });

  it("an edit that changes nothing on the job does not churn the job's version; a PENDING reading never moves job totals", async () => {
    const m = await newMachine(t);
    const s = await newActiveSession(t, m.id);
    const pending = await db.dailyWorkLog.create({
      data: {
        workSessionId: s.id,
        date: new Date("2026-10-01"),
        startHourMeter: 100,
        endHourMeter: 105,
        hoursWorked: 5,
        dieselLiters: 10,
        status: "PENDING",
        source: "OPERATOR",
      },
    });
    const result = ok(
      await updateDailyLog(t.businessId, t.actor, pending.id, {
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 106,
        dieselLiters: 12,
      }),
    );
    expect(result.hoursWorked).toBe(6);
    expect(await session(s.id)).toMatchObject({ totalHours: 0, dieselLiters: null, version: 0 });
    expect(await machine(m.id)).toMatchObject({ currentHourMeter: 100, version: 0 });
    expect((await log(pending.id)).version).toBe(1);
  });

  it("is audited with the reading's before/after and the job/machine effect", async () => {
    const { s, a } = await jobWithTwoDays();
    ok(
      await updateDailyLog(t.businessId, t.actor, a.logId, {
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 109,
        dieselLiters: 40,
      }),
    );
    const rows = (await auditRows(t.businessId, "DailyWorkLog", a.logId)).filter((r) => r.action === "dailyLog.update");
    expect(rows).toHaveLength(1);
    expect(snapshot(rows[0].before)).toMatchObject({ endHourMeter: 108, hoursWorked: 8, version: 0 });
    expect(snapshot(rows[0].after)).toMatchObject({ endHourMeter: 109, hoursWorked: 9, version: 1 });
    expect(snapshot(rows[0].before)).not.toHaveProperty("workSession");
    expect((rows[0].details as { sessionTotalHours: { from: number; to: number } }).sessionTotalHours).toEqual({
      from: 12,
      to: 13,
    });
    expect((rows[0].details as { workSessionId: string }).workSessionId).toBe(s.id);
  });

  it("refuses to move a reading onto a day that already has one", async () => {
    const { a } = await jobWithTwoDays();
    const result = failed(
      await updateDailyLog(t.businessId, t.actor, a.logId, {
        date: "2026-10-02",
        startHourMeter: 100,
        endHourMeter: 108,
      }),
    );
    expect(result.code).toBe("CONFLICT");
  });
});

describe("deleteDailyLog", () => {
  it("re-sums the job, unwinds diesel, rewinds the meter, and is audited", async () => {
    const { m, s, a, b } = await jobWithTwoDays();
    const jobBefore = await session(s.id);
    const machineBefore = await machine(m.id);

    ok(await deleteDailyLog(t.businessId, t.actor, b.logId, { expectedVersion: b.version }));

    expect(await db.dailyWorkLog.count({ where: { id: b.logId } })).toBe(0);
    expect(await session(s.id)).toMatchObject({ totalHours: 8, dieselLiters: 40, version: jobBefore.version + 1 });
    // The machine follows the latest remaining reading (day 1 ends at 108).
    expect(await machine(m.id)).toMatchObject({ currentHourMeter: 108, version: machineBefore.version + 1 });

    const rows = await auditRows(t.businessId, "DailyWorkLog", b.logId);
    const del = rows.find((r) => r.action === "dailyLog.delete");
    expect(del).toBeDefined();
    expect(snapshot(del?.before)).toMatchObject({ id: b.logId, hoursWorked: 4, dieselLiters: 20 });
    expect(del?.after).toBeNull();

    // Deleting the last reading puts the meter back at the job's start reading.
    ok(await deleteDailyLog(t.businessId, t.actor, a.logId));
    expect(await session(s.id)).toMatchObject({ totalHours: 0, dieselLiters: 0 });
    expect((await machine(m.id)).currentHourMeter).toBe(100);
  });

  it("refuses a stale expectedVersion", async () => {
    const { b } = await jobWithTwoDays();
    const result = failed(await deleteDailyLog(t.businessId, t.actor, b.logId, { expectedVersion: b.version + 3 }));
    expect(result.code).toBe("RESOURCE_MODIFIED");
    expect(await db.dailyWorkLog.count({ where: { id: b.logId } })).toBe(1);
  });
});

describe("operator submission, approval and rejection", () => {
  it("an operator's reading lands PENDING without moving anything, and is audited as the operator", async () => {
    const m = await newMachine(t);
    const s = await newActiveSession(t, m.id);

    const submitted = ok(
      await submitDailyLog(t.operatorId, {
        workSessionId: s.id,
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 106,
        dieselLiters: 25,
      }),
    );
    expect(submitted.hoursWorked).toBe(6);

    const pending = await db.dailyWorkLog.findFirstOrThrow({ where: { workSessionId: s.id } });
    expect(pending).toMatchObject({ status: "PENDING", source: "OPERATOR", version: 0 });
    expect(await session(s.id)).toMatchObject({ totalHours: 0, dieselLiters: null, version: 0 });
    expect(await machine(m.id)).toMatchObject({ currentHourMeter: 100, version: 0 });
    expect((await listPendingLogs(t.businessId)).some((l) => l.id === pending.id)).toBe(true);

    const rows = await auditRows(t.businessId, "DailyWorkLog", pending.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "dailyLog.add", actorType: "OPERATOR", actorId: t.operatorId });

    // Same day again: refused.
    const dup = failed(
      await submitDailyLog(t.operatorId, { workSessionId: s.id, date: "2026-10-01", startHourMeter: 106, endHourMeter: 108 }),
    );
    expect(dup.code).toBe("CONFLICT");
  });

  it("an operator can only submit to the job on the machine they are paired with", async () => {
    const m = await newMachine(t, { paired: false });
    const s = await newActiveSession(t, m.id);
    const result = failed(
      await submitDailyLog(t.operatorId, { workSessionId: s.id, date: "2026-10-01", startHourMeter: 100, endHourMeter: 104 }),
    );
    expect(result.code).toBe("NOT_FOUND");
    expect(await db.dailyWorkLog.count({ where: { workSessionId: s.id } })).toBe(0);
  });

  it("approving makes the reading official (job totals, diesel, meter), moves versions, and is audited; a second approval is refused", async () => {
    const m = await newMachine(t);
    const s = await newActiveSession(t, m.id);
    ok(
      await submitDailyLog(t.operatorId, {
        workSessionId: s.id,
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 106,
        dieselLiters: 25,
        attachment: "Bucket",
      }),
    );
    const pending = await db.dailyWorkLog.findFirstOrThrow({ where: { workSessionId: s.id } });

    // A stale version is refused first.
    const stale = failed(await approveDailyLog(t.businessId, t.actor, pending.id, { expectedVersion: pending.version + 1 }));
    expect(stale.code).toBe("RESOURCE_MODIFIED");
    expect((await log(pending.id)).status).toBe("PENDING");

    ok(await approveDailyLog(t.businessId, t.actor, pending.id, { expectedVersion: pending.version }));

    expect(await log(pending.id)).toMatchObject({ status: "APPROVED", version: pending.version + 1 });
    expect(await session(s.id)).toMatchObject({ totalHours: 6, dieselLiters: 25, attachment: "Bucket", version: 1 });
    expect(await machine(m.id)).toMatchObject({ currentHourMeter: 106, version: m.version + 1 });

    const rows = (await auditRows(t.businessId, "DailyWorkLog", pending.id)).filter((r) => r.action === "dailyLog.approve");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorType: "OWNER", actorId: t.userId });
    expect(snapshot(rows[0].before)).toMatchObject({ status: "PENDING" });
    expect(snapshot(rows[0].after)).toMatchObject({ status: "APPROVED" });

    // The diesel must not be added twice.
    const again = failed(await approveDailyLog(t.businessId, t.actor, pending.id));
    expect(again.code).toBe("CONFLICT");
    expect((await session(s.id)).dieselLiters).toBe(25);
  });

  it("rejecting leaves the job and machine untouched and is audited", async () => {
    const m = await newMachine(t);
    const s = await newActiveSession(t, m.id);
    ok(
      await submitDailyLog(t.operatorId, {
        workSessionId: s.id,
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 106,
        dieselLiters: 25,
      }),
    );
    const pending = await db.dailyWorkLog.findFirstOrThrow({ where: { workSessionId: s.id } });

    const stale = failed(await rejectDailyLog(t.businessId, t.actor, pending.id, { expectedVersion: 9 }));
    expect(stale.code).toBe("RESOURCE_MODIFIED");

    ok(await rejectDailyLog(t.businessId, t.actor, pending.id));
    expect(await log(pending.id)).toMatchObject({ status: "REJECTED", version: 1 });
    expect(await session(s.id)).toMatchObject({ totalHours: 0, dieselLiters: null, version: 0 });
    expect(await machine(m.id)).toMatchObject({ currentHourMeter: 100, version: 0 });

    const rows = (await auditRows(t.businessId, "DailyWorkLog", pending.id)).filter((r) => r.action === "dailyLog.reject");
    expect(rows).toHaveLength(1);
    expect(snapshot(rows[0].after)).toMatchObject({ status: "REJECTED" });

    // A rejected day can be submitted again.
    ok(
      await submitDailyLog(t.operatorId, { workSessionId: s.id, date: "2026-10-01", startHourMeter: 100, endHourMeter: 107 }),
    );

    // And a reviewed reading cannot be rejected a second time.
    expect(failed(await rejectDailyLog(t.businessId, t.actor, pending.id)).code).toBe("CONFLICT");
  });

  it("approving a reading of a FINISHED job only ever moves the machine's meter forward", async () => {
    const m = await newMachine(t, { currentHourMeter: 150 });
    const s = await db.workSession.create({
      data: {
        businessId: t.businessId,
        excavatorId: m.id,
        customerId: t.customerId,
        siteId: t.siteId,
        operatorId: t.operatorId,
        startDate: new Date("2026-10-01"),
        endDate: new Date("2026-10-02"),
        startHourMeter: 100,
        endHourMeter: 110,
        totalHours: 0,
        status: "COMPLETED",
      },
    });
    const old = await db.dailyWorkLog.create({
      data: {
        workSessionId: s.id,
        date: new Date("2026-10-01"),
        startHourMeter: 100,
        endHourMeter: 105,
        hoursWorked: 5,
        status: "PENDING",
        source: "OPERATOR",
      },
    });
    ok(await approveDailyLog(t.businessId, t.actor, old.id));
    expect(await machine(m.id)).toMatchObject({ currentHourMeter: 150, version: 0 });
    expect((await session(s.id)).totalHours).toBe(5);
  });
});
