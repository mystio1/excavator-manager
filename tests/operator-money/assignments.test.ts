import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { assignOperator, endOperatorAssignment, getAssignmentHistoryForExcavator } from "@/lib/services/operatorAssignments";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";

/** Pairing an operator with a machine is audited, exclusive (one ACTIVE pairing per machine) and tenant scoped. */

let t: TestTenant;
let other: TestTenant;

beforeAll(async () => {
  t = await createTenant("assign");
  other = await createTenant("assign-other");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await cleanupTenant(other.businessId);
});

describe("assignOperator / endOperatorAssignment", () => {
  it("starts a pairing: ACTIVE assignment, machine pointer set, version bumped, audited", async () => {
    const before = await db.excavator.findUniqueOrThrow({ where: { id: t.excavatorId } });
    const result = await assignOperator(t.businessId, t.actor, { excavatorId: t.excavatorId, operatorId: t.operatorId });
    expect(result).toEqual({ ok: true });

    const machine = await db.excavator.findUniqueOrThrow({ where: { id: t.excavatorId } });
    expect(machine.currentOperatorId).toBe(t.operatorId);
    expect(machine.version).toBe(before.version + 1);

    const active = await db.operatorAssignment.findMany({ where: { businessId: t.businessId, excavatorId: t.excavatorId, status: "ACTIVE" } });
    expect(active).toHaveLength(1);

    const audit = await db.auditLog.findFirstOrThrow({
      where: { businessId: t.businessId, action: "operator.assignment.start", entityId: active[0]!.id },
    });
    expect(audit).toMatchObject({ entityType: "OperatorAssignment", actorType: "OWNER", actorId: t.userId });
    expect(audit.after).toMatchObject({ id: active[0]!.id, status: "ACTIVE", operatorId: t.operatorId });
    expect(audit.details).toMatchObject({ excavatorId: t.excavatorId, operatorId: t.operatorId });
  });

  it("re-assigning ends the previous pairing (at most one ACTIVE) and records who was replaced", async () => {
    const second = await db.operator.create({ data: { businessId: t.businessId, name: "Second Op", mobile: "9888888888" } });
    await assignOperator(t.businessId, t.actor, { excavatorId: t.excavatorId, operatorId: t.operatorId });
    await assignOperator(t.businessId, t.actor, { excavatorId: t.excavatorId, operatorId: second.id });

    const active = await db.operatorAssignment.findMany({ where: { businessId: t.businessId, excavatorId: t.excavatorId, status: "ACTIVE" } });
    expect(active.map((a) => a.operatorId)).toEqual([second.id]);
    expect((await db.excavator.findUniqueOrThrow({ where: { id: t.excavatorId } })).currentOperatorId).toBe(second.id);

    const audit = await db.auditLog.findFirstOrThrow({
      where: { businessId: t.businessId, action: "operator.assignment.start", entityId: active[0]!.id },
    });
    expect(audit.details).toMatchObject({ previousOperatorId: t.operatorId });
    expect((audit.details as { endedAssignmentIds: string[] }).endedAssignmentIds.length).toBeGreaterThan(0);

    const history = await getAssignmentHistoryForExcavator(t.businessId, t.excavatorId);
    expect(history.filter((h) => h.status === "ACTIVE")).toHaveLength(1);
    expect(history.filter((h) => h.status === "ENDED").every((h) => h.endDate !== null)).toBe(true);
  });

  it("two simultaneous assignments still leave exactly one ACTIVE pairing", async () => {
    const own = await createTenant("assign-race");
    try {
      const rival = await db.operator.create({ data: { businessId: own.businessId, name: "Rival", mobile: "9999999990" } });
      await Promise.all([
        assignOperator(own.businessId, own.actor, { excavatorId: own.excavatorId, operatorId: own.operatorId }),
        assignOperator(own.businessId, own.actor, { excavatorId: own.excavatorId, operatorId: rival.id }),
      ]);
      const active = await db.operatorAssignment.findMany({ where: { businessId: own.businessId, excavatorId: own.excavatorId, status: "ACTIVE" } });
      expect(active).toHaveLength(1);
      const machine = await db.excavator.findUniqueOrThrow({ where: { id: own.excavatorId } });
      expect(machine.currentOperatorId).toBe(active[0]!.operatorId);
    } finally {
      await cleanupTenant(own.businessId);
    }
  });

  it("ending a pairing closes the ACTIVE row, clears the machine and audits each ended assignment", async () => {
    await assignOperator(t.businessId, t.actor, { excavatorId: t.excavatorId, operatorId: t.operatorId });
    const active = await db.operatorAssignment.findFirstOrThrow({ where: { businessId: t.businessId, excavatorId: t.excavatorId, status: "ACTIVE" } });

    expect(await endOperatorAssignment(t.businessId, t.actor, t.excavatorId)).toEqual({ ok: true });

    expect((await db.excavator.findUniqueOrThrow({ where: { id: t.excavatorId } })).currentOperatorId).toBeNull();
    const ended = await db.operatorAssignment.findUniqueOrThrow({ where: { id: active.id } });
    expect(ended.status).toBe("ENDED");
    expect(ended.endDate).not.toBeNull();

    const audit = await db.auditLog.findFirstOrThrow({ where: { businessId: t.businessId, action: "operator.assignment.end", entityId: active.id } });
    expect(audit.before).toMatchObject({ status: "ACTIVE" });
    expect(audit.after).toMatchObject({ status: "ENDED" });
  });

  it("ending when nothing is assigned is a harmless no-op that writes no audit row", async () => {
    const own = await createTenant("assign-noop");
    try {
      expect(await endOperatorAssignment(own.businessId, own.actor, own.excavatorId)).toEqual({ ok: true });
      expect(await db.auditLog.count({ where: { businessId: own.businessId, action: "operator.assignment.end" } })).toBe(0);
    } finally {
      await cleanupTenant(own.businessId);
    }
  });

  it("tenant isolation: another tenant's machine or operator is NOT_FOUND and nothing changes", async () => {
    const foreignMachine = await assignOperator(t.businessId, t.actor, { excavatorId: other.excavatorId, operatorId: t.operatorId });
    expect(foreignMachine).toMatchObject({ code: "NOT_FOUND" });

    const foreignOperator = await assignOperator(t.businessId, t.actor, { excavatorId: t.excavatorId, operatorId: other.operatorId });
    expect(foreignOperator).toMatchObject({ code: "NOT_FOUND" });

    const foreignEnd = await endOperatorAssignment(t.businessId, t.actor, other.excavatorId);
    expect(foreignEnd).toMatchObject({ code: "NOT_FOUND" });

    expect(await db.operatorAssignment.count({ where: { businessId: other.businessId } })).toBe(0);
    expect((await db.excavator.findUniqueOrThrow({ where: { id: other.excavatorId } })).currentOperatorId).toBeNull();
  });
});
