import { db } from "@/lib/db";
import { fail } from "@/lib/api-error";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { withTx, type Tx } from "@/lib/tx";

/** Serializes assignment changes on one machine (SELECT … FOR UPDATE on the
 * excavator row) so two concurrent assign calls can never both leave an
 * ACTIVE pairing behind — "at most one ACTIVE OperatorAssignment per excavator". */
async function lockExcavator(tx: Tx, businessId: string, excavatorId: string) {
  await tx.$queryRaw`SELECT 1 FROM "Excavator" WHERE "id" = ${excavatorId} AND "businessId" = ${businessId} FOR UPDATE`;
}

/** Assigns (or re-assigns) the operator permanently paired with this
 * machine — a stable, weeks-long pairing set once from the Machine page,
 * completely independent of daily WorkSession start/stop. Ends any
 * currently-open pairing on this machine first so there's always at most
 * one ACTIVE OperatorAssignment per excavator. Both the machine and the
 * operator must belong to the caller's business. */
export async function assignOperator(
  businessId: string,
  actor: AuditActor,
  input: { excavatorId: string; operatorId: string },
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    await lockExcavator(tx, businessId, input.excavatorId);
    const excavator = await tx.excavator.findFirst({ where: { id: input.excavatorId, businessId } });
    if (!excavator) return fail("NOT_FOUND", "Machine not found");

    const operator = await tx.operator.findFirst({
      where: { id: input.operatorId, businessId },
      select: { id: true, name: true },
    });
    if (!operator) return fail("NOT_FOUND", "Operator not found");

    const now = new Date();

    const ended = await tx.operatorAssignment.findMany({
      where: { businessId, excavatorId: input.excavatorId, status: "ACTIVE" },
      select: { id: true, operatorId: true },
    });
    if (ended.length > 0) {
      await tx.operatorAssignment.updateMany({
        where: { id: { in: ended.map((a) => a.id) } },
        data: { status: "ENDED", endDate: now },
      });
    }

    const assignment = await tx.operatorAssignment.create({
      data: {
        businessId,
        excavatorId: input.excavatorId,
        operatorId: operator.id,
        startDate: now,
        status: "ACTIVE",
      },
    });

    await tx.excavator.update({
      where: { id: input.excavatorId },
      data: { currentOperatorId: operator.id, version: { increment: 1 } },
    });

    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.assignment.start",
      entityType: "OperatorAssignment",
      entityId: assignment.id,
      before: { currentOperatorId: excavator.currentOperatorId },
      after: assignment,
      details: {
        excavatorId: excavator.id,
        excavatorName: excavator.name,
        operatorId: operator.id,
        operatorName: operator.name,
        previousOperatorId: excavator.currentOperatorId,
        endedAssignmentIds: ended.map((a) => a.id),
      },
    });

    return { ok: true } as const;
  });
}

export async function endOperatorAssignment(
  businessId: string,
  actor: AuditActor,
  excavatorId: string,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    await lockExcavator(tx, businessId, excavatorId);
    const excavator = await tx.excavator.findFirst({ where: { id: excavatorId, businessId } });
    if (!excavator) return fail("NOT_FOUND", "Machine not found");

    const now = new Date();
    const active = await tx.operatorAssignment.findMany({
      where: { businessId, excavatorId, status: "ACTIVE" },
    });
    if (active.length > 0) {
      await tx.operatorAssignment.updateMany({
        where: { id: { in: active.map((a) => a.id) } },
        data: { status: "ENDED", endDate: now },
      });
    }
    if (excavator.currentOperatorId !== null) {
      await tx.excavator.update({
        where: { id: excavatorId },
        data: { currentOperatorId: null, version: { increment: 1 } },
      });
    }

    for (const assignment of active) {
      await recordAudit(tx, {
        businessId,
        actor,
        action: "operator.assignment.end",
        entityType: "OperatorAssignment",
        entityId: assignment.id,
        before: assignment,
        after: { ...assignment, status: "ENDED", endDate: now },
        details: { excavatorId, excavatorName: excavator.name, operatorId: assignment.operatorId },
      });
    }
    // The pairing pointer was set but no open assignment row backed it (legacy
    // data) — still record that the machine's operator was cleared.
    if (active.length === 0 && excavator.currentOperatorId) {
      await recordAudit(tx, {
        businessId,
        actor,
        action: "operator.assignment.end",
        entityType: "Excavator",
        entityId: excavatorId,
        before: { currentOperatorId: excavator.currentOperatorId },
        after: { currentOperatorId: null },
        details: { excavatorName: excavator.name, operatorId: excavator.currentOperatorId },
      });
    }

    return { ok: true } as const;
  });
}

export async function getAssignmentHistoryForExcavator(businessId: string, excavatorId: string) {
  return db.operatorAssignment.findMany({
    where: { businessId, excavatorId },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    include: { operator: { select: { name: true } } },
  });
}

export async function getAssignmentHistoryForOperator(businessId: string, operatorId: string) {
  return db.operatorAssignment.findMany({
    where: { businessId, operatorId },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    include: { excavator: { select: { name: true, machineNumber: true } } },
  });
}
