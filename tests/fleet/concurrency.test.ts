import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addDailyLog,
  approveDailyLog,
  stopWork,
  submitDailyLog,
  updateWorkSession,
} from "@/lib/services/workSessions";
import { updateExcavator } from "@/lib/services/excavators";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { newActiveSession, newMachine, ok } from "./helpers";

/**
 * Two requests racing for the same record (a double tap, two devices, two
 * admins): the row lock + the version check must let exactly one through.
 */

let t: TestTenant;

beforeAll(async () => {
  t = await createTenant("fleet-race");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
});

const succeeded = (results: unknown[]) => results.filter((r) => !(typeof r === "object" && r !== null && "error" in r));
const codes = (results: unknown[]) =>
  results.flatMap((r) => (typeof r === "object" && r !== null && "code" in r ? [(r as { code: string }).code] : []));

describe("concurrent writers", () => {
  it("two simultaneous readings for the same day store exactly one (and count its diesel once)", async () => {
    const m = await newMachine(t);
    const s = await newActiveSession(t, m.id);
    const input = { workSessionId: s.id, date: "2026-10-01", startHourMeter: 100, endHourMeter: 108, dieselLiters: 10 };

    const results = await Promise.all([addDailyLog(t.businessId, t.actor, input), addDailyLog(t.businessId, t.actor, input)]);

    expect(succeeded(results)).toHaveLength(1);
    expect(codes(results)).toEqual(["CONFLICT"]);
    expect(await db.dailyWorkLog.count({ where: { workSessionId: s.id } })).toBe(1);
    expect(await db.workSession.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ totalHours: 8, dieselLiters: 10 });
  });

  it("two admins approving the same reading at once: one approves, diesel is added once", async () => {
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

    const results = await Promise.all([
      approveDailyLog(t.businessId, t.actor, pending.id),
      approveDailyLog(t.businessId, t.actor, pending.id),
    ]);

    expect(succeeded(results)).toHaveLength(1);
    expect(codes(results)).toEqual(["CONFLICT"]);
    expect(await db.workSession.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({
      totalHours: 6,
      dieselLiters: 25,
      version: 1,
    });
  });

  it("two edits of the same job from the same loaded version: one wins, the other gets RESOURCE_MODIFIED", async () => {
    const m = await newMachine(t);
    const s = await newActiveSession(t, m.id);
    const body = (siteName: string) => ({
      customerId: t.customerId,
      operatorId: t.operatorId,
      siteName,
      startDate: "2026-10-01",
      startHourMeter: 100,
      totalHours: 3,
      expectedVersion: 0,
    });

    const results = await Promise.all([
      updateWorkSession(t.businessId, t.actor, s.id, body("Site One")),
      updateWorkSession(t.businessId, t.actor, s.id, body("Site Two")),
    ]);

    expect(succeeded(results)).toHaveLength(1);
    expect(codes(results)).toEqual(["RESOURCE_MODIFIED"]);
    expect((await db.workSession.findUniqueOrThrow({ where: { id: s.id } })).version).toBe(1);
  });

  it("two edits of the same machine from the same loaded version: one wins", async () => {
    const m = await newMachine(t);
    const body = (name: string) => ({ name, expectedVersion: 0 });
    const results = await Promise.all([
      updateExcavator(t.businessId, t.actor, m.id, body("Edit One")),
      updateExcavator(t.businessId, t.actor, m.id, body("Edit Two")),
    ]);
    expect(succeeded(results)).toHaveLength(1);
    expect(codes(results)).toEqual(["RESOURCE_MODIFIED"]);
    expect((await db.excavator.findUniqueOrThrow({ where: { id: m.id } })).version).toBe(1);
  });

  it("stopping a job twice at once completes it once", async () => {
    const m = await newMachine(t);
    const s = await newActiveSession(t, m.id);
    const input = { workSessionId: s.id, endDate: "2026-10-02", endHourMeter: 110 };

    const results = await Promise.all([stopWork(t.businessId, t.actor, input), stopWork(t.businessId, t.actor, input)]);

    expect(succeeded(results)).toHaveLength(1);
    expect(codes(results)).toEqual(["NOT_FOUND"]);
    expect(await db.workSession.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ status: "COMPLETED", version: 1 });
    expect((await db.excavator.findUniqueOrThrow({ where: { id: m.id } })).version).toBe(m.version + 1);
  });
});
