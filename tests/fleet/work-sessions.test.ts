import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addDailyLog,
  deleteWorkSession,
  startWork,
  stopWork,
  updateWorkSession,
} from "@/lib/services/workSessions";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { auditRows, billSession, failed, newActiveSession, newMachine, ok, snapshot } from "./helpers";

/**
 * Work sessions (jobs): start / stop / edit / delete against the real database,
 * including optimistic concurrency, the billed-job rules and the audit trail.
 */

let t: TestTenant;

beforeAll(async () => {
  t = await createTenant("fleet-sessions");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
});

/** The form body updateWorkSession receives, with the session's own values by default. */
function editBody(session: { customerId: string; operatorId: string }, over: Record<string, unknown> = {}) {
  return {
    customerId: session.customerId,
    operatorId: session.operatorId,
    siteName: "Test Site",
    startDate: "2026-10-01",
    startHourMeter: 100,
    ...over,
  };
}

describe("startWork / stopWork", () => {
  it("starts a job: machine goes WORKING at the start meter, its version moves, and it is audited", async () => {
    const machine = await newMachine(t, { currentHourMeter: 90 });
    await db.excavator.update({ where: { id: machine.id }, data: { status: "IDLE" } });

    const { session } = ok(
      await startWork(t.businessId, t.actor, {
        excavatorId: machine.id,
        customerId: t.customerId,
        siteName: "  kharadi  ",
        startDate: "2026-10-02",
        startHourMeter: 105.555,
      }),
    );

    // Hours/meters are rounded ONCE, half-up, on the shortest decimal form.
    expect(session.startHourMeter).toBe(105.56);
    expect(session.status).toBe("ACTIVE");
    expect(session.operatorId).toBe(t.operatorId);
    expect(session.version).toBe(0);

    const after = await db.excavator.findUniqueOrThrow({ where: { id: machine.id } });
    expect(after).toMatchObject({ status: "WORKING", currentHourMeter: 105.56, version: machine.version + 1 });

    const rows = await auditRows(t.businessId, "WorkSession", session.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "workSession.start", actorType: "OWNER", actorId: t.userId });
    expect(snapshot(rows[0].after).startHourMeter).toBe(105.56);

    // A second job cannot start on a machine that is already working.
    const again = failed(
      await startWork(t.businessId, t.actor, {
        excavatorId: machine.id,
        customerId: t.customerId,
        siteName: "Elsewhere",
        startDate: "2026-10-03",
        startHourMeter: 106,
      }),
    );
    expect(again.code).toBe("CONFLICT");
  });

  it("refuses to start without a paired operator", async () => {
    const machine = await newMachine(t, { paired: false });
    const result = failed(
      await startWork(t.businessId, t.actor, {
        excavatorId: machine.id,
        customerId: t.customerId,
        siteName: "Site",
        startDate: "2026-10-02",
        startHourMeter: 100,
      }),
    );
    expect(result.code).toBe("CONFLICT");
  });

  it("stops a job: hours from the meter, machine IDLE at the end meter, versions move, audited before/after", async () => {
    const machine = await newMachine(t);
    const session = await newActiveSession(t, machine.id);

    // Stale expectedVersion (someone else changed the job) is refused and changes nothing.
    const stale = failed(
      await stopWork(
        t.businessId,
        t.actor,
        { workSessionId: session.id, endDate: "2026-10-02", endHourMeter: 107.5, expectedVersion: session.version + 5 },
        { excavatorId: machine.id },
      ),
    );
    expect(stale.code).toBe("RESOURCE_MODIFIED");
    expect((await db.workSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe("ACTIVE");

    // End meter must be past the start meter.
    const tooLow = failed(
      await stopWork(t.businessId, t.actor, { workSessionId: session.id, endDate: "2026-10-02", endHourMeter: 100 }),
    );
    expect(tooLow.code).toBe("VALIDATION_FAILED");

    // A route can pin the job to the machine named in its URL.
    const otherMachine = await newMachine(t, { name: "Other JCB" });
    const wrongMachine = failed(
      await stopWork(
        t.businessId,
        t.actor,
        { workSessionId: session.id, endDate: "2026-10-02", endHourMeter: 107.5 },
        { excavatorId: otherMachine.id },
      ),
    );
    expect(wrongMachine.code).toBe("NOT_FOUND");

    const result = ok(
      await stopWork(
        t.businessId,
        t.actor,
        { workSessionId: session.id, endDate: "2026-10-02", endHourMeter: 107.5, dieselLiters: 30, expectedVersion: 0 },
        { excavatorId: machine.id },
      ),
    );
    expect(result.totalHours).toBe(7.5);
    expect(result.version).toBe(1);

    const stopped = await db.workSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(stopped).toMatchObject({ status: "COMPLETED", totalHours: 7.5, endHourMeter: 107.5, dieselLiters: 30, version: 1 });
    const machineAfter = await db.excavator.findUniqueOrThrow({ where: { id: machine.id } });
    expect(machineAfter).toMatchObject({ status: "IDLE", currentHourMeter: 107.5, version: machine.version + 1 });

    const rows = await auditRows(t.businessId, "WorkSession", session.id);
    expect(rows.map((r) => r.action)).toEqual(["workSession.stop"]);
    expect(snapshot(rows[0].before)).toMatchObject({ status: "ACTIVE", version: 0 });
    expect(snapshot(rows[0].after)).toMatchObject({ status: "COMPLETED", totalHours: 7.5, version: 1 });
  });

  it("stopping a job uses the approved readings' hours when there are any", async () => {
    const machine = await newMachine(t);
    const session = await newActiveSession(t, machine.id);
    ok(
      await addDailyLog(t.businessId, t.actor, {
        workSessionId: session.id,
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 104,
      }),
    );
    // End meter says 10 h, but the approved reading says 4 h: the readings win.
    const result = ok(
      await stopWork(t.businessId, t.actor, { workSessionId: session.id, endDate: "2026-10-02", endHourMeter: 110 }),
    );
    expect(result.totalHours).toBe(4);
  });
});

describe("updateWorkSession", () => {
  it("takes the typed hours when the job has no approved readings, else derives them from the meter", async () => {
    const machine = await newMachine(t);
    const session = await newActiveSession(t, machine.id);

    ok(await updateWorkSession(t.businessId, t.actor, session.id, editBody(session, { totalHours: 6.755 })));
    expect((await db.workSession.findUniqueOrThrow({ where: { id: session.id } })).totalHours).toBe(6.76);

    // No typed hours, but both meters: hours = meter difference.
    ok(
      await updateWorkSession(
        t.businessId,
        t.actor,
        session.id,
        editBody(session, { endHourMeter: 109.25, endDate: "2026-10-02" }),
      ),
    );
    expect((await db.workSession.findUniqueOrThrow({ where: { id: session.id } })).totalHours).toBe(9.25);
  });

  it("derives hours from the approved readings (ignoring typed hours and pending readings)", async () => {
    const machine = await newMachine(t);
    const session = await newActiveSession(t, machine.id);
    ok(
      await addDailyLog(t.businessId, t.actor, {
        workSessionId: session.id,
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 105,
      }),
    );
    ok(
      await addDailyLog(t.businessId, t.actor, {
        workSessionId: session.id,
        date: "2026-10-02",
        startTime: "08:00",
        stopTime: "12:30",
        breakMinutes: 30,
      }),
    );
    // A PENDING operator reading must never count.
    await db.dailyWorkLog.create({
      data: { workSessionId: session.id, date: new Date("2026-10-03"), hoursWorked: 50, status: "PENDING", source: "OPERATOR" },
    });

    const fresh = await db.workSession.findUniqueOrThrow({ where: { id: session.id } });
    ok(await updateWorkSession(t.businessId, t.actor, session.id, editBody(fresh, { totalHours: 99, notes: "fixed" })));

    const after = await db.workSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(after.totalHours).toBe(9); // 5 h (meter) + 4 h (08:00-12:30 minus 30 min)
    expect(after.notes).toBe("fixed");
  });

  it("is an optimistic-concurrency write: stale version refused, success moves the version once, audited before/after", async () => {
    const machine = await newMachine(t);
    const session = await newActiveSession(t, machine.id);

    const first = ok(
      await updateWorkSession(
        t.businessId,
        t.actor,
        session.id,
        editBody(session, { siteName: "Hinjewadi", expectedVersion: 0, totalHours: 2 }),
      ),
    );
    expect(first.version).toBe(1);

    // The same (now stale) version again: refused, nothing written.
    const stale = failed(
      await updateWorkSession(
        t.businessId,
        t.actor,
        session.id,
        editBody(session, { siteName: "Overwritten", expectedVersion: 0, totalHours: 3 }),
      ),
    );
    expect(stale.code).toBe("RESOURCE_MODIFIED");
    expect(stale.error).toMatch(/changed by someone else/i);
    const unchanged = await db.workSession.findUniqueOrThrow({ where: { id: session.id }, include: { site: true } });
    expect(unchanged).toMatchObject({ version: 1, totalHours: 2 });
    expect(unchanged.site.name).toBe("Hinjewadi");

    // Older clients (no expectedVersion) still work.
    const legacy = ok(await updateWorkSession(t.businessId, t.actor, session.id, editBody(session, { totalHours: 4 })));
    expect(legacy.version).toBe(2);

    const rows = await auditRows(t.businessId, "WorkSession", session.id);
    expect(rows.map((r) => r.action)).toEqual(["workSession.update", "workSession.update"]);
    expect(snapshot(rows[0].before)).toMatchObject({ version: 0, totalHours: 0 });
    expect(snapshot(rows[0].after)).toMatchObject({ version: 1, totalHours: 2 });
    expect(rows[0]).toMatchObject({ actorType: "OWNER", actorId: t.userId });
  });

  it("validates dates and meters", async () => {
    const machine = await newMachine(t);
    const session = await newActiveSession(t, machine.id);
    const badDates = failed(
      await updateWorkSession(t.businessId, t.actor, session.id, editBody(session, { endDate: "2026-09-01" })),
    );
    expect(badDates.code).toBe("VALIDATION_FAILED");
    const badMeters = failed(
      await updateWorkSession(t.businessId, t.actor, session.id, editBody(session, { endHourMeter: 90 })),
    );
    expect(badMeters.code).toBe("VALIDATION_FAILED");
  });

  it("lets a billed job be corrected, but the bill keeps its own snapshot (and the audit flags it)", async () => {
    const machine = await newMachine(t);
    const session = await db.workSession.create({
      data: {
        businessId: t.businessId,
        excavatorId: machine.id,
        customerId: t.customerId,
        siteId: t.siteId,
        operatorId: t.operatorId,
        startDate: new Date("2026-10-01"),
        endDate: new Date("2026-10-01"),
        startHourMeter: 100,
        endHourMeter: 108,
        totalHours: 8,
        status: "COMPLETED",
      },
    });
    const { item } = await billSession(t, session.id, machine.id, "FLEET-EDIT-1");

    ok(await updateWorkSession(t.businessId, t.actor, session.id, editBody(session, { endHourMeter: 110, endDate: "2026-10-01" })));

    const edited = await db.workSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(edited.totalHours).toBe(10);
    const billLine = await db.billItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(billLine.hours.toString()).toBe("8");
    expect(billLine.amount.toString()).toBe("800");
    expect(billLine.workSessionId).toBe(session.id);

    const rows = await auditRows(t.businessId, "WorkSession", session.id);
    expect((rows[0].details as { billed: boolean }).billed).toBe(true);
  });

  it("moves the machine's meter with a corrected latest completed job (and bumps the machine's version)", async () => {
    const machine = await newMachine(t, { currentHourMeter: 108 });
    const session = await db.workSession.create({
      data: {
        businessId: t.businessId,
        excavatorId: machine.id,
        customerId: t.customerId,
        siteId: t.siteId,
        operatorId: t.operatorId,
        startDate: new Date("2026-10-01"),
        endDate: new Date("2026-10-01"),
        startHourMeter: 100,
        endHourMeter: 108,
        totalHours: 8,
        status: "COMPLETED",
      },
    });
    ok(await updateWorkSession(t.businessId, t.actor, session.id, editBody(session, { endHourMeter: 112, endDate: "2026-10-01" })));
    const after = await db.excavator.findUniqueOrThrow({ where: { id: machine.id } });
    expect(after.currentHourMeter).toBe(112);
    expect(after.version).toBe(machine.version + 1);
  });
});

describe("deleteWorkSession", () => {
  it("is refused while the job is on a bill (409 code), and nothing is removed", async () => {
    const machine = await newMachine(t);
    const session = await newActiveSession(t, machine.id);
    ok(
      await addDailyLog(t.businessId, t.actor, {
        workSessionId: session.id,
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 108,
      }),
    );
    await billSession(t, session.id, machine.id, "FLEET-DEL-1");

    const result = failed(await deleteWorkSession(t.businessId, t.actor, session.id));
    expect(result.code).toBe("WORK_SESSION_ALREADY_BILLED");

    expect(await db.workSession.count({ where: { id: session.id } })).toBe(1);
    expect(await db.dailyWorkLog.count({ where: { workSessionId: session.id } })).toBe(1);
    const rows = await auditRows(t.businessId, "WorkSession", session.id);
    expect(rows.some((r) => r.action === "workSession.delete")).toBe(false);
  });

  it("removes an unbilled job with its readings, frees an ACTIVE machine, and audits the removed state", async () => {
    const machine = await newMachine(t);
    const session = await newActiveSession(t, machine.id);
    ok(
      await addDailyLog(t.businessId, t.actor, {
        workSessionId: session.id,
        date: "2026-10-01",
        startHourMeter: 100,
        endHourMeter: 108,
      }),
    );
    ok(
      await addDailyLog(t.businessId, t.actor, {
        workSessionId: session.id,
        date: "2026-10-02",
        startHourMeter: 108,
        endHourMeter: 112,
      }),
    );
    const before = await db.workSession.findUniqueOrThrow({ where: { id: session.id } });
    const machineBefore = await db.excavator.findUniqueOrThrow({ where: { id: machine.id } });

    // Stale version: refused.
    const stale = failed(await deleteWorkSession(t.businessId, t.actor, session.id, { expectedVersion: before.version - 1 }));
    expect(stale.code).toBe("RESOURCE_MODIFIED");
    expect(await db.workSession.count({ where: { id: session.id } })).toBe(1);

    ok(await deleteWorkSession(t.businessId, t.actor, session.id, { expectedVersion: before.version }));

    expect(await db.workSession.count({ where: { id: session.id } })).toBe(0);
    expect(await db.dailyWorkLog.count({ where: { workSessionId: session.id } })).toBe(0);
    const machineAfter = await db.excavator.findUniqueOrThrow({ where: { id: machine.id } });
    expect(machineAfter.status).toBe("IDLE");
    expect(machineAfter.version).toBe(machineBefore.version + 1);

    const rows = await auditRows(t.businessId, "WorkSession", session.id);
    const deleteRow = rows.find((r) => r.action === "workSession.delete");
    expect(deleteRow).toBeDefined();
    expect(snapshot(deleteRow?.before)).toMatchObject({ id: session.id, totalHours: 12 });
    expect((snapshot(deleteRow?.before).dailyLogs as unknown[]).length).toBe(2);
    expect(deleteRow?.after).toBeNull();
  });

  it("a missing job is a 404-style failure", async () => {
    const result = failed(await deleteWorkSession(t.businessId, t.actor, "does-not-exist"));
    expect(result.code).toBe("NOT_FOUND");
  });
});
