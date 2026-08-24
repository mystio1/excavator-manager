import { db } from "@/lib/db";

/** Assigns (or re-assigns) the operator permanently paired with this
 * machine — a stable, weeks-long pairing set once from the Machine page,
 * completely independent of daily WorkSession start/stop. Ends any
 * currently-open pairing on this machine first so there's always at most
 * one ACTIVE OperatorAssignment per excavator. */
export async function assignOperator(businessId: string, input: { excavatorId: string; operatorId: string }) {
  const excavator = await db.excavator.findFirst({ where: { id: input.excavatorId, businessId } });
  if (!excavator) return { error: "Machine not found" } as const;

  const now = new Date();

  await db.$transaction([
    db.operatorAssignment.updateMany({
      where: { excavatorId: input.excavatorId, status: "ACTIVE" },
      data: { status: "ENDED", endDate: now },
    }),
    db.operatorAssignment.create({
      data: {
        businessId,
        excavatorId: input.excavatorId,
        operatorId: input.operatorId,
        startDate: now,
        status: "ACTIVE",
      },
    }),
    db.excavator.update({
      where: { id: input.excavatorId },
      data: { currentOperatorId: input.operatorId },
    }),
  ]);

  return { ok: true } as const;
}

export async function endOperatorAssignment(businessId: string, excavatorId: string) {
  const excavator = await db.excavator.findFirst({ where: { id: excavatorId, businessId } });
  if (!excavator) return { error: "Machine not found" } as const;

  await db.$transaction([
    db.operatorAssignment.updateMany({
      where: { excavatorId, status: "ACTIVE" },
      data: { status: "ENDED", endDate: new Date() },
    }),
    db.excavator.update({ where: { id: excavatorId }, data: { currentOperatorId: null } }),
  ]);

  return { ok: true } as const;
}

export async function getAssignmentHistoryForExcavator(businessId: string, excavatorId: string) {
  return db.operatorAssignment.findMany({
    where: { businessId, excavatorId },
    orderBy: { startDate: "desc" },
    include: { operator: { select: { name: true } } },
  });
}

export async function getAssignmentHistoryForOperator(businessId: string, operatorId: string) {
  return db.operatorAssignment.findMany({
    where: { businessId, operatorId },
    orderBy: { startDate: "desc" },
    include: { excavator: { select: { name: true, machineNumber: true } } },
  });
}
