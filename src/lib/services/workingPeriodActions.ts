import { db } from "@/lib/db";
import { fail } from "@/lib/api-error";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { Decimal, ZERO, round2 } from "@/lib/money";
import { isStale, lockOperatorRow, resourceModified, withTx, type Tx } from "@/lib/tx";
import {
  START_REASON_LABEL,
  type CreateLeaveInput,
  type StartPeriodInput,
  type UpdatePeriodInput,
} from "@/lib/validation/operatorPeriod";
import {
  addDays,
  calculateOperatorPeriods,
  dayIndex,
  ensureInitialPeriod,
  loadPeriodContext,
  parseDay,
  reattributeTransactions,
  startOfDay,
  type LeaveRow,
  type PeriodRow,
} from "./workingPeriods";

/**
 * Writes for working periods and leaves. Every function runs in ONE transaction that first takes the
 * operator's row lock (so concurrent period/leave/transaction-attribution changes serialize), validates
 * EVERYTHING before the first write (a failure result must not leave half a change behind), writes, audits
 * and bumps `version` on the period it changes. See workingPeriods.ts for the salary rules.
 */

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 <= b1 && b0 <= a1;
const FOREVER = Number.MAX_SAFE_INTEGER;

async function lockAndLoad(tx: Tx, businessId: string, operatorId: string) {
  if (!(await lockOperatorRow(tx, businessId, operatorId))) return null;
  const operator = await tx.operator.findUniqueOrThrow({ where: { id: operatorId } });
  const periods = await ensureInitialPeriod(tx, operator);
  const leaves = await tx.operatorLeave.findMany({
    where: { businessId, operatorId },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
  return { operator, periods, leaves };
}

const notFound = () => fail("NOT_FOUND", "Operator not found");

// ---------------------------------------------------------------------------
// Start new working period
// ---------------------------------------------------------------------------

type StartPlan = {
  previous: PeriodRow;
  closesActive: boolean;
  prevEnd: Date;
  newStart: Date;
  gapStart: Date;
  gapEnd: Date;
  gapDays: number;
  reuseLeave: LeaveRow | null;
  /** Pending of the previous period at this moment (rounded; > 0 means owed to the operator). */
  pending: Decimal;
  alreadyCarried: boolean;
};

async function planStart(
  tx: Tx,
  businessId: string,
  ctx: { operator: { id: string }; periods: PeriodRow[]; leaves: LeaveRow[] },
  input: { startDate: string; previousEndDate?: string; leaveType?: "UNPAID" | "PAID" },
  now: Date,
): Promise<StartPlan | ReturnType<typeof fail>> {
  const { periods, leaves } = ctx;
  const newStart = parseDay(input.startDate);
  const active = periods.find((p) => p.status === "ACTIVE") ?? null;
  const previous = active ?? periods[periods.length - 1]!;

  const prevEnd = active
    ? input.previousEndDate
      ? parseDay(input.previousEndDate)
      : addDays(newStart, -1)
    : previous.endDate
      ? startOfDay(previous.endDate)
      : addDays(newStart, -1);

  if (dayIndex(newStart) <= dayIndex(previous.startDate)) {
    return fail("VALIDATION_FAILED", "The new Working Period must start after the previous one started.");
  }
  if (dayIndex(prevEnd) < dayIndex(previous.startDate)) {
    return fail("VALIDATION_FAILED", "The previous Working Period cannot end before it started.");
  }
  if (dayIndex(prevEnd) >= dayIndex(newStart)) {
    return fail("VALIDATION_FAILED", "The new Working Period must start after the previous one ends (periods cannot overlap).");
  }

  const gapStart = addDays(prevEnd, 1);
  const gapEnd = addDays(newStart, -1);
  const gapDays = dayIndex(newStart) - dayIndex(prevEnd) - 1;

  let reuseLeave: LeaveRow | null = null;
  for (const l of leaves) {
    const l0 = dayIndex(l.startDate);
    const l1 = dayIndex(l.endDate);
    if (gapDays >= 1 && l0 === dayIndex(gapStart) && l1 === dayIndex(gapEnd)) {
      reuseLeave = l;
      continue;
    }
    // Only a leave already covering part of the GAP is a problem — that is the
    // span this call is about to record a leave for. Leaves inside the periods
    // themselves are allowed and are handled by the accrual.
    if (gapDays >= 1 && overlaps(l0, l1, dayIndex(gapStart), dayIndex(gapEnd))) {
      return fail(
        "CONFLICT",
        "A leave is already recorded between these dates. Remove or adjust it before starting the new Working Period.",
      );
    }
  }

  const alreadyCarried = periods.some((p) => p.openingSourcePeriodId === previous.id);

  // Hypothetical outcome (previous closed on prevEnd, new period open, gap leave recorded) -> the
  // previous period's pending at this moment. Transactions are attributed purely by date here.
  const txs = await tx.operatorTransaction.findMany({
    where: { businessId, operatorId: ctx.operator.id },
    select: { id: true, date: true, amount: true, businessEffect: true, deductFromSalary: true },
  });
  const stub = {
    ...previous,
    id: "__new__",
    startDate: newStart,
    endDate: null,
    status: "ACTIVE",
    monthlySalary: ZERO,
    openingBalance: ZERO,
    openingSourcePeriodId: null,
    createdAt: new Date(now.getTime() + 1),
  } as PeriodRow;
  const hypoPeriods = [
    ...periods.map((p) => (p.id === previous.id ? ({ ...p, endDate: prevEnd, status: "CLOSED" } as PeriodRow) : p)),
    stub,
  ];
  const hypoLeaves: LeaveRow[] =
    gapDays >= 1 && !reuseLeave
      ? [
          ...leaves,
          {
            id: "__gap__",
            businessId,
            operatorId: ctx.operator.id,
            startDate: gapStart,
            endDate: gapEnd,
            type: input.leaveType ?? "UNPAID",
            reason: null,
            createdAt: now,
          } as LeaveRow,
        ]
      : leaves;
  const calc = calculateOperatorPeriods(
    hypoPeriods,
    hypoLeaves,
    txs.map((t) => ({ ...t, workingPeriodId: null })),
    now,
  );
  const pending = round2(calc.periods.find((p) => p.id === previous.id)!.pending);

  return {
    previous,
    closesActive: active !== null,
    prevEnd,
    newStart,
    gapStart,
    gapEnd,
    gapDays,
    reuseLeave,
    pending,
    alreadyCarried,
  };
}

/** Read-only preview used by the "Start New Working Period" dialog to show the carry-forward question with
 * the exact amount. The same computation runs again, authoritatively, when the period is started. */
export async function previewStartPeriod(
  businessId: string,
  operatorId: string,
  startDate: string,
  previousEndDate?: string,
  leaveType?: "UNPAID" | "PAID",
) {
  const operator = await db.operator.findFirst({ where: { id: operatorId, businessId } });
  if (!operator) return notFound();
  const ctx = await loadPeriodContext(db, operator);
  const plan = await planStart(db, businessId, { operator, periods: ctx.periods, leaves: ctx.leaves }, { startDate, previousEndDate, leaveType }, new Date());
  return presentPlan(plan, ctx.periods);
}

function presentPlan(plan: StartPlan | ReturnType<typeof fail>, periods: PeriodRow[]) {
  if ("error" in plan) return plan;
  return {
    previousPeriodId: plan.previous.id,
    previousSession: periods.findIndex((p) => p.id === plan.previous.id) + 1,
    previousEndDate: plan.prevEnd,
    gapDays: plan.gapDays,
    pending: plan.pending.toNumber(),
    needsCarryDecision: plan.pending.gt(0) && !plan.alreadyCarried,
  } as const;
}

export async function startWorkingPeriod(
  businessId: string,
  actor: AuditActor,
  operatorId: string,
  input: StartPeriodInput,
  opts?: { tx?: Tx; now?: Date },
) {
  return withTx(opts?.tx, async (tx) => {
    const now = opts?.now ?? new Date();
    const ctx = await lockAndLoad(tx, businessId, operatorId);
    if (!ctx) return notFound();
    const { operator, periods } = ctx;
    if (operator.isArchived) return fail("CONFLICT", "This operator is archived.");

    const active = periods.find((p) => p.status === "ACTIVE") ?? null;
    if (active && isStale(active.version, input.expectedVersion)) return resourceModified("working period");

    const plan = await planStart(tx, businessId, ctx, input, now);
    if ("error" in plan) return plan;

    // Carry-forward decision. The amount is always the server's own figure, never the client's.
    const owed = plan.pending.gt(0);
    if (owed && input.carryForward === undefined) {
      return fail(
        "BAD_REQUEST",
        `Previous Working Period has an outstanding balance of ${plan.pending.toFixed(2)}. Choose Carry Forward or Keep Separate.`,
      );
    }
    const carry = owed && input.carryForward === true;
    if (carry && plan.alreadyCarried) {
      return fail("CONFLICT", "This Working Period's balance has already been carried forward.");
    }

    const monthly = input.monthlySalary !== undefined ? round2(input.monthlySalary) : round2(operator.defaultMonthlySalary);
    const reasonLabel = input.reason ? START_REASON_LABEL[input.reason] : null;
    const notes =
      [reasonLabel ? (input.reasonText ? `${reasonLabel}: ${input.reasonText}` : reasonLabel) : input.reasonText, input.notes]
        .filter(Boolean)
        .join("\n") || null;

    // ---- writes ----
    let closedPeriod: PeriodRow | null = null;
    if (plan.closesActive) {
      closedPeriod = await tx.operatorWorkingPeriod.update({
        where: { id: plan.previous.id },
        data: { endDate: plan.prevEnd, status: "CLOSED", closedAt: now, version: { increment: 1 } },
      });
      await recordAudit(tx, {
        businessId,
        actor,
        action: "operator.period.close",
        entityType: "OperatorWorkingPeriod",
        entityId: plan.previous.id,
        before: plan.previous,
        after: closedPeriod,
        details: { operatorId, reason: "new working period started" },
      });
    }

    let leave: LeaveRow | null = plan.reuseLeave;
    if (plan.gapDays >= 1 && !plan.reuseLeave) {
      leave = await tx.operatorLeave.create({
        data: {
          businessId,
          operatorId,
          startDate: plan.gapStart,
          endDate: plan.gapEnd,
          type: input.leaveType ?? "UNPAID",
          reason: input.reasonText || reasonLabel,
        },
      });
      await recordAudit(tx, {
        businessId,
        actor,
        action: "operator.leave.create",
        entityType: "OperatorLeave",
        entityId: leave.id,
        after: leave,
        details: { operatorId, automatic: true },
      });
    }

    const created = await tx.operatorWorkingPeriod.create({
      data: {
        businessId,
        operatorId,
        startDate: plan.newStart,
        status: "ACTIVE",
        monthlySalary: monthly,
        openingBalance: carry ? plan.pending : ZERO,
        openingSourcePeriodId: carry ? plan.previous.id : null,
        notes,
      },
    });

    let operatorVersion = operator.version;
    if (!round2(operator.defaultMonthlySalary).equals(monthly)) {
      const updated = await tx.operator.update({
        where: { id: operatorId },
        data: { defaultMonthlySalary: monthly, version: { increment: 1 } },
      });
      operatorVersion = updated.version;
      await recordAudit(tx, {
        businessId,
        actor,
        action: "operator.update",
        entityType: "Operator",
        entityId: operatorId,
        before: operator,
        after: updated,
        details: { via: "operator.period.start" },
      });
    }

    const all = await tx.operatorWorkingPeriod.findMany({
      where: { businessId, operatorId },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    });
    const reattributed = await reattributeTransactions(tx, businessId, operatorId, all);

    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.period.start",
      entityType: "OperatorWorkingPeriod",
      entityId: created.id,
      after: created,
      details: {
        operatorId,
        previousPeriodId: plan.previous.id,
        previousPending: plan.pending.toFixed(2),
        carriedForward: carry,
        carriedAmount: carry ? plan.pending.toFixed(2) : "0.00",
        leaveId: leave?.id ?? null,
        reattributedTransactions: reattributed,
      },
    });

    return {
      ok: true,
      period: created,
      previousPeriod: closedPeriod ?? plan.previous,
      leave,
      previousPending: plan.pending.toNumber(),
      carriedForward: carry ? plan.pending.toNumber() : 0,
      operatorVersion,
    } as const;
  });
}

// ---------------------------------------------------------------------------
// Update / close a period
// ---------------------------------------------------------------------------

export async function updateWorkingPeriod(
  businessId: string,
  actor: AuditActor,
  operatorId: string,
  periodId: string,
  input: UpdatePeriodInput,
  opts?: { tx?: Tx; now?: Date },
) {
  return withTx(opts?.tx, async (tx) => {
    const now = opts?.now ?? new Date();
    const ctx = await lockAndLoad(tx, businessId, operatorId);
    if (!ctx) return notFound();
    const { periods, leaves } = ctx;
    const idx = periods.findIndex((p) => p.id === periodId);
    if (idx < 0) return fail("NOT_FOUND", "Working period not found");
    const period = periods[idx]!;
    if (isStale(period.version, input.expectedVersion)) return resourceModified("working period");

    const carriedOut = periods.some((p) => p.openingSourcePeriodId === period.id);
    const data: { notes?: string | null; startDate?: Date; endDate?: Date; status?: string; closedAt?: Date } = {};
    let action = "operator.period.update";
    const startIdx = dayIndex(period.startDate);

    if (input.notes !== undefined) data.notes = input.notes || null;

    if (input.close) {
      if (period.status !== "ACTIVE") return fail("CONFLICT", "Only the active Working Period can be closed.");
      const end = input.endDate ? parseDay(input.endDate) : startOfDay(now);
      if (dayIndex(end) < startIdx) return fail("VALIDATION_FAILED", "The end date cannot be before the start date.");
      data.endDate = end;
      data.status = "CLOSED";
      data.closedAt = now;
      action = "operator.period.close";
    } else {
      if (input.endDate) {
        if (period.status !== "CLOSED") {
          return fail("CONFLICT", "Use Close Working Period to set the end of the active period.");
        }
        const end = parseDay(input.endDate);
        const next = periods[idx + 1];
        if (dayIndex(end) < startIdx) return fail("VALIDATION_FAILED", "The end date cannot be before the start date.");
        if (next && dayIndex(end) >= dayIndex(next.startDate)) {
          return fail("VALIDATION_FAILED", "The end date must be before the next Working Period starts.");
        }
        if (carriedOut && dayIndex(end) !== dayIndex(period.endDate!)) {
          return fail("CONFLICT", "This period's balance has been carried forward, so its dates are locked.");
        }
        data.endDate = end;
      }
      if (input.startDate) {
        const start = parseDay(input.startDate);
        const prev = periods[idx - 1];
        if (!prev) {
          return fail("CONFLICT", "The first Working Period starts on the joining date. Change it from Edit Operator.");
        }
        if (dayIndex(start) <= dayIndex(prev.startDate) || (prev.endDate && dayIndex(start) <= dayIndex(prev.endDate))) {
          return fail("VALIDATION_FAILED", "The start date must be after the previous Working Period ends.");
        }
        const endIdx = (data.endDate ?? period.endDate) ? dayIndex((data.endDate ?? period.endDate)!) : FOREVER;
        if (dayIndex(start) > endIdx) return fail("VALIDATION_FAILED", "The start date cannot be after the end date.");
        if (carriedOut && dayIndex(start) !== startIdx) {
          return fail("CONFLICT", "This period's balance has been carried forward, so its dates are locked.");
        }
        if (leaves.some((l) => overlaps(dayIndex(l.startDate), dayIndex(l.endDate), dayIndex(start), endIdx))) {
          return fail("CONFLICT", "A leave overlaps those dates. Adjust the leave first.");
        }
        data.startDate = start;
      }
    }

    const after = await tx.operatorWorkingPeriod.update({
      where: { id: period.id },
      data: { ...data, version: { increment: 1 } },
    });
    let reattributed = 0;
    if (data.startDate || data.endDate) {
      const all = await tx.operatorWorkingPeriod.findMany({
        where: { businessId, operatorId },
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      });
      reattributed = await reattributeTransactions(tx, businessId, operatorId, all);
    }
    await recordAudit(tx, {
      businessId,
      actor,
      action,
      entityType: "OperatorWorkingPeriod",
      entityId: period.id,
      before: period,
      after,
      details: { operatorId, reattributedTransactions: reattributed },
    });
    return { ok: true, period: after } as const;
  });
}

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

export async function createLeave(
  businessId: string,
  actor: AuditActor,
  operatorId: string,
  input: CreateLeaveInput,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    const ctx = await lockAndLoad(tx, businessId, operatorId);
    if (!ctx) return notFound();
    const { leaves } = ctx;
    const start = parseDay(input.startDate);
    const end = parseDay(input.endDate);
    const s = dayIndex(start);
    const e = dayIndex(end);
    if (e < s) return fail("VALIDATION_FAILED", "The end date cannot be before the start date.");
    // A leave MAY sit inside a Working Period: that is how absence is recorded
    // against a session already in progress, and how past months get corrected.
    // Unpaid days inside a period are taken off its accrual (see
    // calculateOperatorPeriods); paid days just keep accruing as the period does.
    if (leaves.some((l) => overlaps(s, e, dayIndex(l.startDate), dayIndex(l.endDate)))) {
      return fail("CONFLICT", "Another leave is already recorded on these dates.");
    }

    const leave = await tx.operatorLeave.create({
      data: { businessId, operatorId, startDate: start, endDate: end, type: input.type ?? "UNPAID", reason: input.reason || null },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.leave.create",
      entityType: "OperatorLeave",
      entityId: leave.id,
      after: leave,
      details: { operatorId },
    });
    return { ok: true, leave } as const;
  });
}

export async function deleteLeave(
  businessId: string,
  actor: AuditActor,
  operatorId: string,
  leaveId: string,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    if (!(await lockOperatorRow(tx, businessId, operatorId))) return notFound();
    const before = await tx.operatorLeave.findFirst({ where: { id: leaveId, businessId, operatorId } });
    if (!before) return fail("NOT_FOUND", "Leave not found");
    await tx.operatorLeave.delete({ where: { id: before.id } });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.leave.delete",
      entityType: "OperatorLeave",
      entityId: before.id,
      before,
      details: { operatorId },
    });
    return { ok: true, id: before.id } as const;
  });
}

export async function listLeaves(businessId: string, operatorId: string) {
  return db.operatorLeave.findMany({ where: { businessId, operatorId }, orderBy: { startDate: "desc" } });
}
