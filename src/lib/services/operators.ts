import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { normalizeBusinessCode } from "@/lib/utils/businessCode";
import type { AddOperatorInput } from "@/lib/validation/operator";

export async function listOperators(businessId: string) {
  const operators = await db.operator.findMany({
    where: { businessId, isArchived: false },
    orderBy: { createdAt: "desc" },
    include: {
      assignedExcavators: { select: { name: true, machineNumber: true }, take: 1 },
    },
  });

  return operators.map((op) => ({
    id: op.id,
    name: op.name,
    mobile: op.mobile,
    defaultMonthlySalary: op.defaultMonthlySalary,
    currentExcavator: op.assignedExcavators[0]?.name ?? null,
    joinPending: !op.canLogin && !!op.pinHash,
  }));
}

/** Set from the operator's own portal home page — their personal choice,
 * independent of (and overriding) the admin's business-wide default. */
export async function updateOperatorOwnLanguage(operatorId: string, language: "en" | "hi" | "mr") {
  await db.operator.update({ where: { id: operatorId }, data: { language } });
}

const RANKING_WINDOW_DAYS = 45;

/** "Ranking" section on the Operators page — total hours each operator has
 * actually driven across all their machines over the last 45 days. Mirrors
 * the dashboard's overlap-safe hour-counting: logged days come from
 * DailyWorkLog, and any session with no daily log at all (billed straight
 * off start/end readings) still counts its full totalHours if it overlaps
 * the window, so no worked hour is silently dropped or double-counted. */
export async function getOperatorRankingLast45Days(businessId: string) {
  const end = new Date();
  const start = new Date(end.getTime() - RANKING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const operators = await db.operator.findMany({
    where: { businessId, isArchived: false },
    select: { id: true, name: true },
  });
  if (operators.length === 0) return [];

  const [logs, sessionsWithoutLogs] = await Promise.all([
    db.dailyWorkLog.findMany({
      where: { status: "APPROVED", date: { gte: start, lte: end }, workSession: { businessId } },
      select: { hoursWorked: true, workSession: { select: { operatorId: true } } },
    }),
    db.workSession.findMany({
      where: {
        businessId,
        dailyLogs: { none: {} },
        OR: [{ startDate: { gte: start, lte: end } }, { endDate: { gte: start, lte: end } }],
      },
      select: { operatorId: true, totalHours: true },
    }),
  ]);

  const hoursByOperator = new Map<string, number>();
  for (const log of logs) {
    const opId = log.workSession.operatorId;
    hoursByOperator.set(opId, (hoursByOperator.get(opId) ?? 0) + log.hoursWorked);
  }
  for (const s of sessionsWithoutLogs) {
    hoursByOperator.set(s.operatorId, (hoursByOperator.get(s.operatorId) ?? 0) + s.totalHours);
  }

  return operators
    .map((op) => ({ id: op.id, name: op.name, hours: Math.round((hoursByOperator.get(op.id) ?? 0) * 100) / 100 }))
    .sort((a, b) => b.hours - a.hours);
}

export async function createOperator(businessId: string, input: AddOperatorInput) {
  return db.operator.create({
    data: {
      businessId,
      name: input.name,
      mobile: input.mobile,
      address: input.address || null,
      joiningDate: input.joiningDate ? new Date(input.joiningDate) : null,
      defaultMonthlySalary: input.defaultMonthlySalary ?? 0,
    },
  });
}

export async function updateOperator(businessId: string, id: string, input: AddOperatorInput) {
  return db.operator.updateMany({
    where: { id, businessId },
    data: {
      name: input.name,
      mobile: input.mobile,
      address: input.address || null,
      joiningDate: input.joiningDate ? new Date(input.joiningDate) : null,
      defaultMonthlySalary: input.defaultMonthlySalary ?? 0,
    },
  });
}

export async function archiveOperator(businessId: string, id: string) {
  return db.operator.updateMany({ where: { id, businessId }, data: { isArchived: true } });
}

export async function getOperatorDetail(businessId: string, id: string) {
  const operator = await db.operator.findFirst({
    where: { id, businessId },
    include: { assignedExcavators: { select: { id: true, name: true, machineNumber: true } } },
  });
  if (!operator) return null;

  // Job history (customer/site/hours) — independent of the operator<->machine
  // pairing itself, which lives in OperatorAssignment (see operatorAssignments.ts).
  const pastWork = await db.workSession.findMany({
    where: { operatorId: id, businessId, status: "COMPLETED" },
    orderBy: { startDate: "desc" },
    take: 20,
    include: { excavator: { select: { name: true, machineNumber: true } }, customer: true, site: true },
  });

  return { operator, assignedExcavator: operator.assignedExcavators[0] ?? null, pastWork };
}

/**
 * Also doubles as the approve/decline action for a self-service join
 * request (see requestOperatorJoin): approve is canLogin=true with no pin
 * (their self-chosen PIN from signup starts working as-is); decline is
 * canLogin=false, which — per the rule below — clears it back to a normal
 * non-portal operator rather than leaving a stale request behind.
 *
 * Disabling portal login clears the PIN too — re-enabling later always
 * requires a fresh PIN (set by the Admin here, or by the operator via
 * /operator-signup), never silently reactivating an old one.
 */
export async function setOperatorPin(
  businessId: string,
  id: string,
  input: { canLogin: boolean; pin?: string },
) {
  if (!input.canLogin) {
    return db.operator.updateMany({ where: { id, businessId }, data: { canLogin: false, pinHash: null } });
  }

  if (!input.pin) {
    return db.operator.updateMany({ where: { id, businessId }, data: { canLogin: true } });
  }

  const pinHash = await hashPassword(input.pin);
  return db.operator.updateMany({ where: { id, businessId }, data: { canLogin: true, pinHash } });
}

/** Operator self-service join: no admin invitation needed up front — the
 * operator finds their own way in with the business code, picks a PIN, and
 * lands in a "requested, not yet approved" state (canLogin=false but
 * pinHash set) until an Admin approves them from /operators (see
 * setOperatorPin, reused unchanged for both approve and decline).
 *
 * If an Operator row already exists for this mobile in this business (the
 * common case — the Admin already added them for work tracking before they
 * ever touched the portal), that row is claimed rather than duplicated, so
 * their existing work/salary history carries over. A pre-existing row with
 * canLogin=true and no PIN is a leftover from the old invite-first flow and
 * completes immediately instead of going through approval again. */
export async function requestOperatorJoin(businessCode: string, name: string, mobile: string, pin: string) {
  const business = await db.business.findUnique({ where: { code: normalizeBusinessCode(businessCode) } });
  if (!business) {
    return { error: "Invalid business code — check with your admin." } as const;
  }

  const mobileTrimmed = mobile.trim();
  const existing = await db.operator.findFirst({
    where: { businessId: business.id, mobile: mobileTrimmed, isArchived: false },
  });

  if (existing?.pinHash) {
    return existing.canLogin
      ? ({ error: "This mobile number is already registered — log in instead." } as const)
      : ({ error: "You've already requested to join — ask your admin to approve your account." } as const);
  }

  const pinHash = await hashPassword(pin);

  if (existing) {
    const updated = await db.operator.update({ where: { id: existing.id }, data: { pinHash } });
    return { ok: true, status: updated.canLogin ? "ACTIVE" : "PENDING" } as const;
  }

  await db.operator.create({
    data: { businessId: business.id, name: name.trim(), mobile: mobileTrimmed, pinHash, canLogin: false },
  });
  return { ok: true, status: "PENDING" } as const;
}

export async function listPendingJoinRequests(businessId: string) {
  return db.operator.findMany({
    where: { businessId, isArchived: false, canLogin: false, pinHash: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, mobile: true, createdAt: true },
  });
}

export async function listOperatorOptions(businessId: string) {
  return db.operator.findMany({
    where: { businessId, isArchived: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
