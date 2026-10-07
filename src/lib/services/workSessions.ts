import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ApiHttpError, fail } from "@/lib/api-error";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { dec, round2, sum } from "@/lib/money";
import { LEGACY_LIMIT, pageArgs, toPage, type PageParams } from "@/lib/pagination";
import { isStale, resourceModified, withTx, type Tx } from "@/lib/tx";
import { calcHoursFromClock, calcHoursFromMeter } from "@/lib/utils/hours";
import { findOrCreateSite } from "@/lib/services/sites";
import type {
  DailyLogInput,
  StartWorkInput,
  StopWorkInput,
  UpdateDailyLogInput,
  UpdateWorkSessionInput,
} from "@/lib/validation/workSession";

/** Options shared by the mutating functions. `expectedVersion` is the version
 * the client loaded (optimistic concurrency, docs/api-conventions.md §6) for
 * operations whose HTTP shape has no body to carry it (approve/reject/delete);
 * `excavatorId` lets a route pin the record to the machine named in its URL. */
export type MutationOpts = { tx?: Tx; expectedVersion?: number; excavatorId?: string };

/**
 * The ONE rounding rule for every hours / meter / liters value written to a
 * Float column: 2 decimal places, ROUND_HALF_UP on the shortest decimal
 * representation (so 1.005 -> 1.01, not 1.00 as Math.round(x * 100) would give).
 */
export function roundHours(value: number): number {
  return round2(value).toNumber();
}

const roundOrNull = (value: number | null | undefined) => (value == null ? null : roundHours(value));

/** a + b on quantities (liters), exact to 2 dp. */
const addQty = (a: number | null | undefined, b: number) => roundHours(dec(a).plus(dec(b)).toNumber());
/** a - b on quantities, never below zero. */
const subtractQty = (a: number | null | undefined, b: number) =>
  Math.max(0, roundHours(dec(a).minus(dec(b)).toNumber()));

// ---------------------------------------------------------------------------
// Row locks. Both include the tenant in the statement, so a lock (and the
// "does it exist" answer) can never be obtained for another business's row.
// Table names are fixed literals — never user input.
// ---------------------------------------------------------------------------

export async function lockOwnedExcavator(tx: Tx, businessId: string, excavatorId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Excavator" WHERE "id" = ${excavatorId} AND "businessId" = ${businessId} FOR UPDATE`;
  return rows.length > 0;
}

async function lockOwnedSession(tx: Tx, businessId: string, workSessionId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "WorkSession" WHERE "id" = ${workSessionId} AND "businessId" = ${businessId} FOR UPDATE`;
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Shared derivations
// ---------------------------------------------------------------------------

/** Number of approved readings and their exact total hours. Only APPROVED
 * readings ever count (maintenance/billing must never see a pending one). */
async function approvedHours(tx: Tx, workSessionId: string) {
  const logs = await tx.dailyWorkLog.findMany({
    where: { workSessionId, status: "APPROVED" },
    select: { hoursWorked: true },
  });
  return { count: logs.length, total: roundHours(sum(logs.map((l) => l.hoursWorked)).toNumber()) };
}

/** The most recent approved reading of a job (by day, then entry time). */
function latestApprovedLog(tx: Tx, workSessionId: string) {
  return tx.dailyWorkLog.findFirst({
    where: { workSessionId, status: "APPROVED" },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

const meterOf = (log: { endHourMeter: number | null; startHourMeter: number | null }) =>
  log.endHourMeter ?? log.startHourMeter;

/** Moves the machine's live hour meter, bumping Excavator.version (a meter move
 * is a write like any other). "set" follows the reading exactly; "raise" only
 * ever moves it forward (used when a reading is approved for a job that has
 * already finished — an old reading must never rewind the machine). A no-op
 * when the meter already shows the value. Returns the change for the audit. */
async function syncExcavatorMeter(
  tx: Tx,
  businessId: string,
  excavatorId: string,
  meter: number | null | undefined,
  mode: "set" | "raise" = "set",
) {
  if (meter == null) return null;
  const target = roundHours(meter);
  const excavator = await tx.excavator.findFirst({
    where: { id: excavatorId, businessId },
    select: { currentHourMeter: true },
  });
  if (!excavator || excavator.currentHourMeter === target) return null;
  if (mode === "raise" && target < excavator.currentHourMeter) return null;
  await tx.excavator.update({
    where: { id: excavatorId, businessId },
    data: { currentHourMeter: target, version: { increment: 1 } },
  });
  return { from: excavator.currentHourMeter, to: target };
}

/** Hours for a reading: the meter difference when both readings are given,
 * otherwise the clock time minus breaks. Meters are rounded first so the hours
 * always agree with what is stored. */
function computeHours(input: {
  startHourMeter?: number;
  endHourMeter?: number;
  startTime?: string;
  stopTime?: string;
  breakMinutes?: number;
}) {
  return input.startHourMeter != null && input.endHourMeter != null
    ? calcHoursFromMeter(roundHours(input.startHourMeter), roundHours(input.endHourMeter))
    : calcHoursFromClock(input.startTime!, input.stopTime!, input.breakMinutes ?? 0);
}

const INVALID_HOURS = "Working hours must be greater than 0 — check the times or readings";

async function hasDuplicateLog(tx: Tx, workSessionId: string, date: string, exceptLogId?: string) {
  // Dates are always parsed from a bare "YYYY-MM-DD" string (here and in
  // startWork/stopWork), so every log for the same calendar day lands on the
  // exact same UTC-midnight instant — an equality check is enough. Rejected
  // logs don't block a resubmission for the same day. The caller holds the
  // session's row lock, so two concurrent submissions cannot both pass.
  const duplicate = await tx.dailyWorkLog.findFirst({
    where: {
      workSessionId,
      date: new Date(date),
      status: { in: ["APPROVED", "PENDING"] },
      ...(exceptLogId ? { id: { not: exceptLogId } } : {}),
    },
    select: { id: true },
  });
  return duplicate != null;
}

function logData(input: Omit<DailyLogInput, "workSessionId">, hoursWorked: number) {
  return {
    date: new Date(input.date),
    startTime: input.startTime || null,
    stopTime: input.stopTime || null,
    breakMinutes: input.breakMinutes ?? null,
    startHourMeter: roundOrNull(input.startHourMeter),
    endHourMeter: roundOrNull(input.endHourMeter),
    hoursWorked,
    dieselLiters: roundOrNull(input.dieselLiters),
    notes: input.notes || null,
    attachment: input.attachment || null,
  };
}

// ---------------------------------------------------------------------------
// Start / stop a job
// ---------------------------------------------------------------------------

/**
 * Starts a job (customer/site/hours) on a machine. The operator is never
 * picked here — it's snapshotted from whichever operator is currently
 * paired with the machine (Excavator.currentOperatorId, set from the
 * Machine page's Assign Operator control), so starting/stopping daily jobs
 * never disturbs that weeks-long pairing.
 */
export async function startWork(businessId: string, actor: AuditActor, input: StartWorkInput, opts?: { tx?: Tx }) {
  return withTx(opts?.tx, async (tx) => {
    // The machine's row lock serializes concurrent starts, so "already has
    // active work" cannot be raced past by two taps / two devices.
    if (!(await lockOwnedExcavator(tx, businessId, input.excavatorId))) return fail("NOT_FOUND", "Machine not found");
    const excavator = await tx.excavator.findFirst({ where: { id: input.excavatorId, businessId } });
    if (!excavator) return fail("NOT_FOUND", "Machine not found");
    if (!excavator.currentOperatorId) {
      return fail("CONFLICT", "Assign an operator to this machine first, from the Machine page.");
    }

    // The customer must belong to THIS business — never link a job to
    // another tenant's customer by guessing an id.
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, businessId }, select: { id: true, isArchived: true } });
    if (!customer) return fail("NOT_FOUND", "Customer not found");
    // Invariant: new work cannot be started for a removed (archived) customer.
    if (customer.isArchived) return fail("CONFLICT", "This customer was removed. Choose another customer.");

    const alreadyActive = await tx.workSession.findFirst({
      where: { businessId, excavatorId: input.excavatorId, status: "ACTIVE" },
      select: { id: true },
    });
    if (alreadyActive) return fail("CONFLICT", "This machine already has active work. Stop it first.");

    const openOperatorRequest = await tx.operatorWorkRequest.findFirst({
      where: { businessId, excavatorId: input.excavatorId, status: { in: ["ACTIVE", "PENDING"] } },
      select: { id: true },
    });
    if (openOperatorRequest) {
      return fail("CONFLICT", "The operator has an in-progress job on this machine — review it first.");
    }

    const site = await findOrCreateSite(businessId, input.siteName, tx);
    const startHourMeter = roundHours(input.startHourMeter);

    const session = await tx.workSession.create({
      data: {
        businessId,
        excavatorId: input.excavatorId,
        customerId: input.customerId,
        siteId: site.id,
        operatorId: excavator.currentOperatorId,
        startDate: new Date(input.startDate),
        startHourMeter,
        attachment: input.attachment || null,
        status: "ACTIVE",
      },
    });

    await tx.excavator.update({
      where: { id: input.excavatorId, businessId },
      data: { status: "WORKING", currentHourMeter: startHourMeter, version: { increment: 1 } },
    });

    await recordAudit(tx, {
      businessId,
      actor,
      action: "workSession.start",
      entityType: "WorkSession",
      entityId: session.id,
      after: session,
      details: {
        excavatorId: excavator.id,
        excavatorMeter: { from: excavator.currentHourMeter, to: startHourMeter },
      },
    });

    return { session } as const;
  });
}

export async function stopWork(businessId: string, actor: AuditActor, input: StopWorkInput, opts?: MutationOpts) {
  return withTx(opts?.tx, async (tx) => {
    if (!(await lockOwnedSession(tx, businessId, input.workSessionId))) {
      return fail("NOT_FOUND", "Work session not found or already stopped");
    }
    const session = await tx.workSession.findFirst({
      where: {
        id: input.workSessionId,
        businessId,
        status: "ACTIVE",
        ...(opts?.excavatorId ? { excavatorId: opts.excavatorId } : {}),
      },
    });
    if (!session) return fail("NOT_FOUND", "Work session not found or already stopped");
    if (isStale(session.version, input.expectedVersion ?? opts?.expectedVersion)) {
      return resourceModified("work record");
    }

    const endHourMeter = roundHours(input.endHourMeter);
    if (endHourMeter <= session.startHourMeter) {
      return fail("VALIDATION_FAILED", "End hour meter must be greater than the starting hour meter");
    }

    const approved = await approvedHours(tx, session.id);
    const totalHours = approved.count > 0 ? approved.total : calcHoursFromMeter(session.startHourMeter, endHourMeter);

    const updated = await tx.workSession.update({
      where: { id: session.id, businessId },
      data: {
        endDate: new Date(input.endDate),
        endHourMeter,
        totalHours,
        status: "COMPLETED",
        version: { increment: 1 },
        // Added to whatever was already recorded earlier in this job (e.g.
        // from the operator's own start-work entry) rather than replacing it
        // — a machine can get topped up more than once before a job wraps up,
        // and overwriting would silently lose that earlier fill-up. Only
        // touched at all when diesel is actually reported this time; an
        // existing note is likewise left alone when none is given now.
        ...(input.dieselLiters != null && {
          dieselLiters: addQty(session.dieselLiters, input.dieselLiters),
          dieselDate: new Date(input.endDate),
        }),
        ...(input.notes && { notes: input.notes }),
      },
    });

    const excavator = await tx.excavator.findFirst({
      where: { id: session.excavatorId, businessId },
      select: { currentHourMeter: true },
    });
    await tx.excavator.update({
      where: { id: session.excavatorId, businessId },
      data: { status: "IDLE", currentHourMeter: endHourMeter, version: { increment: 1 } },
    });

    await recordAudit(tx, {
      businessId,
      actor,
      action: "workSession.stop",
      entityType: "WorkSession",
      entityId: session.id,
      before: session,
      after: updated,
      details: {
        excavatorId: session.excavatorId,
        excavatorMeter: { from: excavator?.currentHourMeter ?? null, to: endHourMeter },
      },
    });

    return { totalHours, version: updated.version } as const;
  });
}

// ---------------------------------------------------------------------------
// Daily readings
// ---------------------------------------------------------------------------

/** Admin path — entered directly by the owner, auto-approved immediately
 * (unchanged behavior from before the operator portal existed). */
export async function addDailyLog(businessId: string, actor: AuditActor, input: DailyLogInput, opts?: MutationOpts) {
  return withTx(opts?.tx, async (tx) => {
    if (!(await lockOwnedSession(tx, businessId, input.workSessionId))) {
      return fail("NOT_FOUND", "Work session not found or already stopped");
    }
    const session = await tx.workSession.findFirst({
      where: {
        id: input.workSessionId,
        businessId,
        status: "ACTIVE",
        ...(opts?.excavatorId ? { excavatorId: opts.excavatorId } : {}),
      },
    });
    if (!session) return fail("NOT_FOUND", "Work session not found or already stopped");

    if (await hasDuplicateLog(tx, session.id, input.date)) {
      return fail("CONFLICT", "Hours for this date are already logged — edit or remove that entry first");
    }

    const hoursWorked = computeHours(input);
    if (!(hoursWorked > 0)) return fail("VALIDATION_FAILED", INVALID_HOURS);

    const log = await tx.dailyWorkLog.create({
      data: {
        workSessionId: session.id,
        ...logData(input, hoursWorked),
        operatorName: input.operatorName || null,
        source: "ADMIN",
        status: "APPROVED",
        reviewedAt: new Date(),
      },
    });

    // One write to the session for everything this reading changes (hours,
    // diesel, tool): the version moves once per operation, not once per field.
    // Diesel is added to whatever's already there (same accumulate-not-
    // overwrite reasoning as stopWork); attachment is set, not merged, since
    // it's the current tool rather than a quantity to sum.
    const approved = await approvedHours(tx, session.id);
    const updatedSession = await tx.workSession.update({
      where: { id: session.id, businessId },
      data: {
        totalHours: approved.total,
        version: { increment: 1 },
        ...(log.dieselLiters != null && {
          dieselLiters: addQty(session.dieselLiters, log.dieselLiters),
          dieselDate: log.date,
        }),
        ...(log.attachment && { attachment: log.attachment }),
      },
    });

    const latest = await latestApprovedLog(tx, session.id);
    const excavatorMeter = await syncExcavatorMeter(
      tx,
      businessId,
      session.excavatorId,
      latest ? meterOf(latest) : null,
    );

    await recordAudit(tx, {
      businessId,
      actor,
      action: "dailyLog.add",
      entityType: "DailyWorkLog",
      entityId: log.id,
      after: log,
      details: {
        workSessionId: session.id,
        excavatorId: session.excavatorId,
        sessionTotalHours: { from: session.totalHours, to: updatedSession.totalHours },
        sessionDieselLiters: { from: session.dieselLiters, to: updatedSession.dieselLiters },
        excavatorMeter,
      },
    });

    return { hoursWorked, logId: log.id, version: log.version } as const;
  });
}

/** Operator-portal path — lands PENDING. Does not move
 * Excavator.currentHourMeter or WorkSession.totalHours until an Admin
 * approves it (see approveDailyLog): maintenance/billing must never see an
 * unapproved reading. The signature is stable: callers pass only the
 * operator's id, the audit actor is derived here. */
export async function submitDailyLog(operatorId: string, input: DailyLogInput) {
  const actor: AuditActor = { type: "OPERATOR", id: operatorId, name: `operator:${operatorId}` };
  return withTx(undefined, async (tx) => {
    // The operator's own business is the tenant for every query below.
    const operator = await tx.operator.findUnique({ where: { id: operatorId }, select: { businessId: true } });
    if (!operator) return fail("NOT_FOUND", "No active job found for your assigned machine");
    const { businessId } = operator;

    if (!(await lockOwnedSession(tx, businessId, input.workSessionId))) {
      return fail("NOT_FOUND", "No active job found for your assigned machine");
    }
    // Ownership check is against the machine's *current* pairing, not the
    // session's operatorId snapshot — the operator submitting must be the one
    // currently assigned to this machine right now, not whoever it was
    // assigned to when the job happened to start.
    const session = await tx.workSession.findFirst({
      where: {
        id: input.workSessionId,
        businessId,
        status: "ACTIVE",
        excavator: { currentOperatorId: operatorId, businessId },
      },
    });
    if (!session) return fail("NOT_FOUND", "No active job found for your assigned machine");

    if (await hasDuplicateLog(tx, session.id, input.date)) {
      return fail("CONFLICT", "A reading for this date is already submitted");
    }

    const hoursWorked = computeHours(input);
    if (!(hoursWorked > 0)) return fail("VALIDATION_FAILED", INVALID_HOURS);

    const log = await tx.dailyWorkLog.create({
      data: {
        workSessionId: session.id,
        ...logData(input, hoursWorked),
        source: "OPERATOR",
        status: "PENDING",
      },
    });

    await recordAudit(tx, {
      businessId,
      actor,
      action: "dailyLog.add",
      entityType: "DailyWorkLog",
      entityId: log.id,
      after: log,
      details: { workSessionId: session.id, excavatorId: session.excavatorId, source: "OPERATOR" },
    });

    return { hoursWorked } as const;
  });
}

export async function listPendingLogs(businessId: string) {
  return db.dailyWorkLog.findMany({
    where: { status: "PENDING", workSession: { businessId } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    // Pending readings are cleared by approving/rejecting them, so this stays
    // small; the cap only guards against a runaway backlog.
    take: 500,
    include: {
      workSession: {
        include: {
          // Only what the approvals screen shows. (The whole operator row —
          // PIN hash included — used to ride along in this API response.)
          excavator: {
            select: { id: true, name: true, machineNumber: true, brand: true, model: true, status: true, currentHourMeter: true },
          },
          operator: { select: { id: true, name: true, mobile: true } },
        },
      },
    },
  });
}

export async function countPendingLogs(businessId: string) {
  return db.dailyWorkLog.count({ where: { status: "PENDING", workSession: { businessId } } });
}

/** Finds the reading AFTER taking its job's row lock, so the status/version
 * decision below is made on values nobody else can change underneath us.
 * Returns null when the reading is not this business's. */
async function lockLogForUpdate(tx: Tx, businessId: string, logId: string) {
  const probe = await tx.dailyWorkLog.findFirst({
    where: { id: logId, workSession: { businessId } },
    select: { workSessionId: true },
  });
  if (!probe) return null;
  if (!(await lockOwnedSession(tx, businessId, probe.workSessionId))) return null;
  return tx.dailyWorkLog.findFirst({
    where: { id: logId, workSession: { businessId } },
    include: { workSession: true },
  });
}

/** The reading without its embedded job — the audit snapshot is of the reading alone. */
function stripSession<T extends { workSession: unknown }>(log: T): Omit<T, "workSession"> {
  const copy: Partial<T> = { ...log };
  delete copy.workSession;
  return copy as Omit<T, "workSession">;
}

/** Admin approves an operator-submitted reading. This is the moment the
 * reading becomes "official" — Excavator.currentHourMeter and the session's
 * totalHours only advance here, so maintenance reminders recalculate
 * immediately off the newly-approved value. */
export async function approveDailyLog(businessId: string, actor: AuditActor, logId: string, opts?: MutationOpts) {
  return withTx(opts?.tx, async (tx) => {
    const log = await lockLogForUpdate(tx, businessId, logId);
    if (!log) return fail("NOT_FOUND", "Reading not found or already reviewed");
    // Two admins (or a double tap) approving the same reading must not add
    // its diesel to the job twice — only the first one finds it PENDING.
    if (log.status !== "PENDING") return fail("CONFLICT", "Reading not found or already reviewed");
    if (isStale(log.version, opts?.expectedVersion)) return resourceModified("reading");

    const session = log.workSession;
    const approvedLog = await tx.dailyWorkLog.update({
      where: { id: log.id },
      data: { status: "APPROVED", reviewedAt: new Date(), version: { increment: 1 } },
    });

    const approved = await approvedHours(tx, session.id);
    // Same moment diesel/attachment become "official," mirroring
    // currentHourMeter below — diesel is added to whatever's already on the
    // session (see addDailyLog/stopWork), attachment is set since it's the
    // current tool, not a quantity to sum.
    const updatedSession = await tx.workSession.update({
      where: { id: session.id, businessId },
      data: {
        totalHours: approved.total,
        version: { increment: 1 },
        ...(log.dieselLiters != null && {
          dieselLiters: addQty(session.dieselLiters, log.dieselLiters),
          dieselDate: log.date,
        }),
        ...(log.attachment && { attachment: log.attachment }),
      },
    });

    // A running job's machine follows its latest approved reading; for a job
    // that already finished, approving an old reading may only move the
    // meter forward, never rewind what stopWork recorded.
    let excavatorMeter: { from: number; to: number } | null;
    if (session.status === "ACTIVE") {
      const latest = await latestApprovedLog(tx, session.id);
      excavatorMeter = await syncExcavatorMeter(tx, businessId, session.excavatorId, latest ? meterOf(latest) : null);
    } else {
      excavatorMeter = await syncExcavatorMeter(tx, businessId, session.excavatorId, meterOf(log), "raise");
    }

    await recordAudit(tx, {
      businessId,
      actor,
      action: "dailyLog.approve",
      entityType: "DailyWorkLog",
      entityId: log.id,
      before: stripSession(log),
      after: approvedLog,
      details: {
        workSessionId: session.id,
        excavatorId: session.excavatorId,
        sessionTotalHours: { from: session.totalHours, to: updatedSession.totalHours },
        sessionDieselLiters: { from: session.dieselLiters, to: updatedSession.dieselLiters },
        excavatorMeter,
      },
    });

    return { ok: true } as const;
  });
}

export async function rejectDailyLog(businessId: string, actor: AuditActor, logId: string, opts?: MutationOpts) {
  return withTx(opts?.tx, async (tx) => {
    const log = await lockLogForUpdate(tx, businessId, logId);
    if (!log) return fail("NOT_FOUND", "Reading not found or already reviewed");
    if (log.status !== "PENDING") return fail("CONFLICT", "Reading not found or already reviewed");
    if (isStale(log.version, opts?.expectedVersion)) return resourceModified("reading");

    const rejected = await tx.dailyWorkLog.update({
      where: { id: log.id },
      data: { status: "REJECTED", reviewedAt: new Date(), version: { increment: 1 } },
    });

    await recordAudit(tx, {
      businessId,
      actor,
      action: "dailyLog.reject",
      entityType: "DailyWorkLog",
      entityId: log.id,
      before: stripSession(log),
      after: rejected,
      details: { workSessionId: log.workSessionId },
    });

    return { ok: true } as const;
  });
}

/** Admin edits any reading — pending, approved or rejected, active or
 * completed session. Re-derives hours from the new values, re-sums the
 * session's totalHours, and keeps the session's diesel total in step (only
 * an APPROVED log's diesel ever counted toward it). The machine's live
 * hour meter only follows when the log belongs to the ACTIVE session. */
export async function updateDailyLog(
  businessId: string,
  actor: AuditActor,
  logId: string,
  input: UpdateDailyLogInput,
  opts?: MutationOpts,
) {
  const { expectedVersion, ...fields } = input;
  return withTx(opts?.tx, async (tx) => {
    const log = await lockLogForUpdate(tx, businessId, logId);
    if (!log) return fail("NOT_FOUND", "Reading not found");
    if (isStale(log.version, expectedVersion ?? opts?.expectedVersion)) return resourceModified("reading");
    const session = log.workSession;

    const date = new Date(fields.date);
    if (date.getTime() !== log.date.getTime() && (await hasDuplicateLog(tx, log.workSessionId, fields.date, log.id))) {
      return fail("CONFLICT", "Another reading already exists for that date");
    }

    const hoursWorked = computeHours(fields);
    if (!(hoursWorked > 0)) return fail("VALIDATION_FAILED", INVALID_HOURS);

    const updatedLog = await tx.dailyWorkLog.update({
      where: { id: log.id },
      data: {
        ...logData(fields, hoursWorked),
        operatorName: fields.operatorName || null,
        version: { increment: 1 },
      },
    });

    // Everything this edit changes on the job goes in ONE session write, and
    // only when something actually changed (so the version doesn't churn).
    const sessionChanges: Prisma.WorkSessionUpdateInput = {};
    const approved = await approvedHours(tx, session.id);
    if (approved.total !== session.totalHours) sessionChanges.totalHours = approved.total;

    let excavatorMeter: { from: number; to: number } | null = null;
    if (log.status === "APPROVED") {
      const dieselDiff = dec(updatedLog.dieselLiters).minus(dec(log.dieselLiters));
      if (!dieselDiff.isZero()) {
        sessionChanges.dieselLiters = Math.max(0, roundHours(dec(session.dieselLiters).plus(dieselDiff).toNumber()));
      }
      if (updatedLog.attachment && updatedLog.attachment !== session.attachment) {
        sessionChanges.attachment = updatedLog.attachment;
      }
      if (session.status === "ACTIVE") {
        const latest = await latestApprovedLog(tx, session.id);
        excavatorMeter = await syncExcavatorMeter(tx, businessId, session.excavatorId, latest ? meterOf(latest) : null);
      }
    }

    let updatedSession = session;
    if (Object.keys(sessionChanges).length > 0) {
      updatedSession = await tx.workSession.update({
        where: { id: session.id, businessId },
        data: { ...sessionChanges, version: { increment: 1 } },
      });
    }

    await recordAudit(tx, {
      businessId,
      actor,
      action: "dailyLog.update",
      entityType: "DailyWorkLog",
      entityId: log.id,
      before: stripSession(log),
      after: updatedLog,
      details: {
        workSessionId: session.id,
        excavatorId: session.excavatorId,
        sessionTotalHours: { from: session.totalHours, to: updatedSession.totalHours },
        sessionDieselLiters: { from: session.dieselLiters, to: updatedSession.dieselLiters },
        excavatorMeter,
      },
    });

    return { hoursWorked, version: updatedLog.version } as const;
  });
}

/** Admin deletes a specific reading (e.g. one entered by mistake) from a
 * machine's history — any status, active or completed session. Always
 * re-sums totalHours from what remains. Only rewinds
 * Excavator.currentHourMeter when the log belonged to the machine's
 * currently ACTIVE session, since that's the only session whose readings
 * still drive the live meter — a completed session's final reading was
 * already fixed at stopWork time and is left untouched. */
export async function deleteDailyLog(businessId: string, actor: AuditActor, logId: string, opts?: MutationOpts) {
  return withTx(opts?.tx, async (tx) => {
    const log = await lockLogForUpdate(tx, businessId, logId);
    if (!log) return fail("NOT_FOUND", "Reading not found");
    if (isStale(log.version, opts?.expectedVersion)) return resourceModified("reading");
    const session = log.workSession;

    await tx.dailyWorkLog.delete({ where: { id: log.id } });

    const sessionChanges: Prisma.WorkSessionUpdateInput = {};
    const approved = await approvedHours(tx, session.id);
    if (approved.total !== session.totalHours) sessionChanges.totalHours = approved.total;

    // Only an APPROVED log's diesel was ever rolled into the session (see
    // approveDailyLog/addDailyLog) — a still-PENDING one never touched it, so
    // there's nothing to unwind there.
    if (log.status === "APPROVED" && log.dieselLiters != null) {
      const diesel = subtractQty(session.dieselLiters, log.dieselLiters);
      if (diesel !== session.dieselLiters) sessionChanges.dieselLiters = diesel;
    }

    let excavatorMeter: { from: number; to: number } | null = null;
    if (session.status === "ACTIVE") {
      const latest = await latestApprovedLog(tx, session.id);
      excavatorMeter = await syncExcavatorMeter(
        tx,
        businessId,
        session.excavatorId,
        latest ? meterOf(latest) : session.startHourMeter,
      );
      // Only when some remaining log actually reports one — unlike hour meter
      // there's no "original" attachment to fall back to, so an empty result
      // here leaves whatever's already on the session alone rather than
      // wiping out a legitimately-set value.
      if (latest?.attachment && latest.attachment !== session.attachment) sessionChanges.attachment = latest.attachment;
    }

    let updatedSession = session;
    if (Object.keys(sessionChanges).length > 0) {
      updatedSession = await tx.workSession.update({
        where: { id: session.id, businessId },
        data: { ...sessionChanges, version: { increment: 1 } },
      });
    }

    await recordAudit(tx, {
      businessId,
      actor,
      action: "dailyLog.delete",
      entityType: "DailyWorkLog",
      entityId: log.id,
      before: stripSession(log),
      details: {
        workSessionId: session.id,
        excavatorId: session.excavatorId,
        sessionTotalHours: { from: session.totalHours, to: updatedSession.totalHours },
        sessionDieselLiters: { from: session.dieselLiters, to: updatedSession.dieselLiters },
        excavatorMeter,
      },
    });

    return { ok: true } as const;
  });
}

// ---------------------------------------------------------------------------
// Whole-job edits
// ---------------------------------------------------------------------------

/** Admin edits any job — active or completed — customer, site, operator,
 * dates, meter readings, hours, diesel, tool, notes. Hours follow the
 * approved daily readings when there are any; otherwise the typed value (or
 * the meter difference) is used. Bills already generated keep their own
 * snapshot (BillItem stores its own hours/rate/site), so nothing billed is
 * rewritten — the audit entry records whether the job was already billed. */
export async function updateWorkSession(
  businessId: string,
  actor: AuditActor,
  id: string,
  input: UpdateWorkSessionInput,
  opts?: MutationOpts,
) {
  const { expectedVersion, ...fields } = input;
  return withTx(opts?.tx, async (tx) => {
    if (!(await lockOwnedSession(tx, businessId, id))) return fail("NOT_FOUND", "Work record not found");
    const session = await tx.workSession.findFirst({ where: { id, businessId } });
    if (!session) return fail("NOT_FOUND", "Work record not found");
    if (isStale(session.version, expectedVersion ?? opts?.expectedVersion)) return resourceModified("work record");

    const [customer, operator] = await Promise.all([
      tx.customer.findFirst({ where: { id: fields.customerId, businessId }, select: { id: true, isArchived: true } }),
      tx.operator.findFirst({ where: { id: fields.operatorId, businessId }, select: { id: true } }),
    ]);
    if (!customer) return fail("NOT_FOUND", "Customer not found");
    if (!operator) return fail("NOT_FOUND", "Operator not found");
    // An existing record may keep an archived customer (old work stays editable); it cannot be moved TO one.
    if (customer.isArchived && fields.customerId !== session.customerId) {
      return fail("CONFLICT", "This customer was removed. Choose another customer.");
    }

    if (fields.endDate && new Date(fields.endDate) < new Date(fields.startDate)) {
      return fail("VALIDATION_FAILED", "End date must be on or after the start date");
    }
    const startHourMeter = roundHours(fields.startHourMeter);
    const endHourMeter = roundOrNull(fields.endHourMeter);
    if (endHourMeter != null && endHourMeter < startHourMeter) {
      return fail("VALIDATION_FAILED", "End reading can't be less than the start reading");
    }

    const site = await findOrCreateSite(businessId, fields.siteName, tx);
    const approved = await approvedHours(tx, id);

    let totalHours = session.totalHours;
    if (approved.count > 0) totalHours = approved.total;
    else if (fields.totalHours != null) totalHours = roundHours(fields.totalHours);
    else if (endHourMeter != null) totalHours = calcHoursFromMeter(startHourMeter, endHourMeter);

    const updated = await tx.workSession.update({
      where: { id, businessId },
      data: {
        customerId: fields.customerId,
        operatorId: fields.operatorId,
        siteId: site.id,
        startDate: new Date(fields.startDate),
        endDate: fields.endDate ? new Date(fields.endDate) : session.status === "COMPLETED" ? session.endDate : null,
        startHourMeter,
        endHourMeter,
        totalHours,
        dieselLiters: roundOrNull(fields.dieselLiters),
        attachment: fields.attachment || null,
        notes: fields.notes || null,
        version: { increment: 1 },
      },
    });

    // Keep the machine's live meter in step when the corrected job is the
    // machine's latest one.
    let excavatorMeter: { from: number; to: number } | null = null;
    if (session.status === "COMPLETED" && endHourMeter != null) {
      const newer = await tx.workSession.findFirst({
        where: { businessId, excavatorId: session.excavatorId, startDate: { gt: new Date(fields.startDate) } },
        select: { id: true },
      });
      if (!newer) excavatorMeter = await syncExcavatorMeter(tx, businessId, session.excavatorId, endHourMeter);
    }

    const billedLines = await tx.billItem.count({ where: { workSessionId: id } });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "workSession.update",
      entityType: "WorkSession",
      entityId: id,
      before: session,
      after: updated,
      details: { excavatorId: session.excavatorId, billed: billedLines > 0, excavatorMeter },
    });

    return { ok: true, version: updated.version } as const;
  });
}

/** Removes a job (and its readings). Refused once any bill line references
 * it — edit or delete that bill first. */
export async function deleteWorkSession(businessId: string, actor: AuditActor, id: string, opts?: MutationOpts) {
  return withTx(opts?.tx, async (tx) => {
    // The row lock is the same one bill creation takes on the session, so a
    // bill cannot slip in between this "is it billed?" check and the delete.
    if (!(await lockOwnedSession(tx, businessId, id))) return fail("NOT_FOUND", "Work record not found");
    const session = await tx.workSession.findFirst({
      where: { id, businessId },
      include: { dailyLogs: { orderBy: { date: "asc" } } },
    });
    if (!session) return fail("NOT_FOUND", "Work record not found");
    if (isStale(session.version, opts?.expectedVersion)) return resourceModified("work record");

    const billedLines = await tx.billItem.count({ where: { workSessionId: id } });
    if (billedLines > 0) {
      return fail("WORK_SESSION_ALREADY_BILLED", "This work is already on a bill — edit or delete that bill first");
    }

    await tx.dailyWorkLog.deleteMany({ where: { workSessionId: id } });
    await tx.workSession.delete({ where: { id, businessId } });
    if (session.status === "ACTIVE") {
      await tx.excavator.update({
        where: { id: session.excavatorId, businessId },
        data: { status: "IDLE", version: { increment: 1 } },
      });
    }

    await recordAudit(tx, {
      businessId,
      actor,
      action: "workSession.delete",
      entityType: "WorkSession",
      entityId: id,
      // The readings go with the job (cascade), so the snapshot carries them.
      before: session,
      details: { excavatorId: session.excavatorId, deletedReadings: session.dailyLogs.length },
    });

    return { ok: true } as const;
  });
}

/** Operator-portal home: the machine they're currently paired with (a
 * stable pairing set from the Machine page, see OperatorAssignment) and, if
 * a job happens to be running on it right now, its readings so they can see
 * Pending/Approved/Rejected. The pairing can be "active" with no job
 * running (e.g. between jobs) — that's expected, not an error state. */
export async function getOperatorPortalState(operatorId: string, businessId: string) {
  const excavator = await db.excavator.findFirst({
    // businessId from the verified operator session: tenant scoping even though
    // an operator id is globally unique.
    where: { currentOperatorId: operatorId, businessId },
    include: { currentSite: { select: { name: true } } },
  });
  if (!excavator) return { excavator: null, activeSession: null };

  const activeSession = await db.workSession.findFirst({
    where: { excavatorId: excavator.id, businessId: excavator.businessId, status: "ACTIVE" },
    // The operator only needs the customer's name (their full record — mobile,
    // GSTIN, address — is the owner's business, not the operator's).
    include: { customer: { select: { id: true, name: true } }, site: true, dailyLogs: { orderBy: { date: "desc" } } },
  });

  return { excavator, activeSession };
}

export type WorkHistoryFilters = {
  customerId?: string;
  siteName?: string;
  operatorId?: string;
  from?: string;
  to?: string;
};

function parseFilterDate(value: string, label: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiHttpError("VALIDATION_FAILED", `Enter a valid ${label} date`);
  return date;
}

/** A machine's jobs, newest first, with cursor pagination: the order is
 * (startDate desc, id desc) so it is stable, and `nextCursor` (the last
 * item's id) is passed back as `cursor` for the next page. Without an
 * explicit `page` (older callers) one bounded legacy page is returned. */
export async function listWorkHistory(
  businessId: string,
  excavatorId: string,
  filters: WorkHistoryFilters = {},
  page: PageParams = { limit: LEGACY_LIMIT, cursor: undefined },
) {
  // from + to together form ONE startDate range (two separate `startDate`
  // keys would silently drop the first).
  const startDate = {
    ...(filters.from ? { gte: parseFilterDate(filters.from, "from") } : {}),
    ...(filters.to ? { lte: parseFilterDate(filters.to, "to") } : {}),
  };

  const rows = await db.workSession.findMany({
    where: {
      businessId,
      excavatorId,
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.siteName ? { site: { name: { contains: filters.siteName, mode: "insensitive" as const } } } : {}),
      ...(filters.operatorId ? { operatorId: filters.operatorId } : {}),
      ...(Object.keys(startDate).length > 0 ? { startDate } : {}),
    },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    ...pageArgs(page),
    include: {
      customer: true,
      site: true,
      // Not `operator: true` — that would put the operator's PIN hash on the wire.
      operator: { select: { id: true, name: true, mobile: true } },
      dailyLogs: { orderBy: { date: "desc" } },
    },
  });

  const { items, nextCursor } = toPage(rows, page.limit);
  return { history: items, nextCursor };
}
