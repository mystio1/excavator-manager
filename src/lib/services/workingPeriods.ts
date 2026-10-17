import type { OperatorLeave, OperatorWorkingPeriod } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { Decimal, ZERO, dec, round2 } from "@/lib/money";
import { lockOperatorRow, type Tx } from "@/lib/tx";
import {
  accrueBaseSalary,
  applyTransaction,
  emptyTotals,
  presentAccrual,
  toMoney,
  type AccrualBreakdown,
} from "./salaryCore";

/**
 * WORKING PERIODS (a.k.a. salary sessions).
 *
 * A working period is a continuous stretch during which an operator works and salary accrues. When an
 * operator goes on leave and returns, a NEW period starts; the joining date is never changed and a closed
 * period is never rewritten. Rules (also documented in docs/operations.md):
 *
 *  - Each period accrues with the SAME engine as the old lifetime figure (accrueBaseSalary: anniversary
 *    cycles from the period start, the running cycle prorated), from startDate to endDate (inclusive) or
 *    today for the ACTIVE one, at the period's own monthlySalary. The "Daily Salary Rate" shown on a period
 *    (monthlySalary / salaryBasisDays) is informational only.
 *  - A gap between two periods is an OperatorLeave. UNPAID accrues nothing. PAID accrues for its days at
 *    the PRECEDING period's monthlySalary (same engine) and that amount is part of the preceding period's
 *    Salary Earned (line "Paid Leave Salary").
 *  - pending = earned + bonus - deductions + openingBalance - paid  (positive = owed to the operator).
 *  - Carry forward moves a period's pending into the next period's openingBalance (a transfer of what was
 *    owed, NOT new salary). The carried-from period keeps its own numbers for history but its pending is
 *    excluded from operator-level totals (only any change made to it AFTER the transfer still counts, so
 *    money is never lost). Kept-separate periods stay in the operator total through their own pending.
 *  - Transactions belong to the period named by workingPeriodId, else the latest period starting on/before
 *    the transaction date (before the first period -> the first one; inside a leave gap -> the preceding
 *    period). Like the legacy lifetime figure, transactions dated before the first period's start or after
 *    today are not counted.
 *  - An operator with exactly one ACTIVE period and no leaves ("legacy" shape) keeps the original
 *    lifetime/month computations untouched, so nothing changes for them.
 */

type Client = Tx;

export type PeriodRow = OperatorWorkingPeriod;
export type LeaveRow = OperatorLeave;

type OperatorLike = {
  id: string;
  businessId: string;
  joiningDate: Date | null;
  createdAt: Date;
  defaultMonthlySalary: Decimal | number | string;
};

export type PeriodTx = {
  id?: string;
  date: Date;
  amount: Decimal;
  businessEffect: string;
  deductFromSalary: boolean;
  workingPeriodId: string | null;
};

// ---------------------------------------------------------------------------
// Calendar-day helpers (local calendar days, like the salary engine)
// ---------------------------------------------------------------------------

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Whole-day index of a local calendar day (DST safe). */
export const dayIndex = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
export const daysBetweenInclusive = (a: Date, b: Date) => dayIndex(b) - dayIndex(a) + 1;

/** "YYYY-MM-DD" (or an ISO timestamp starting with it) -> local midnight of that day. */
export function parseDay(value: string | Date): Date {
  if (value instanceof Date) return startOfDay(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return startOfDay(new Date(value));
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** The stored period that the migration/addOperator would have created for this operator. */
function virtualPeriod(op: OperatorLike): PeriodRow {
  return {
    id: `virtual-${op.id}`,
    version: 0,
    businessId: op.businessId,
    operatorId: op.id,
    startDate: op.joiningDate ?? op.createdAt,
    endDate: null,
    status: "ACTIVE",
    monthlySalary: dec(op.defaultMonthlySalary),
    salaryBasisDays: 30,
    openingBalance: ZERO,
    openingSourcePeriodId: null,
    notes: null,
    createdAt: op.createdAt,
    closedAt: null,
  } as PeriodRow;
}

export const isVirtualPeriod = (p: { id: string }) => p.id.startsWith("virtual-");

/** An operator's periods (oldest first) and leaves. An operator with no stored period (created directly,
 * outside addOperator) is treated as having ONE virtual ACTIVE period from joiningDate ?? createdAt. */
export async function loadPeriodContext(client: Client, op: OperatorLike) {
  const stored = await client.operatorWorkingPeriod.findMany({
    where: { businessId: op.businessId, operatorId: op.id },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
  const leaves = await client.operatorLeave.findMany({
    where: { businessId: op.businessId, operatorId: op.id },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
  const periods = stored.length > 0 ? stored : [virtualPeriod(op)];
  return { periods, leaves, virtual: stored.length === 0 };
}

/** Write paths: make sure the operator has a stored initial period (locks the operator row). */
export async function ensureInitialPeriod(tx: Tx, op: OperatorLike): Promise<PeriodRow[]> {
  const existing = await tx.operatorWorkingPeriod.findMany({
    where: { businessId: op.businessId, operatorId: op.id },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
  if (existing.length > 0) return existing;
  await lockOperatorRow(tx, op.businessId, op.id);
  const again = await tx.operatorWorkingPeriod.findMany({
    where: { businessId: op.businessId, operatorId: op.id },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
  if (again.length > 0) return again;
  const created = await tx.operatorWorkingPeriod.create({
    data: {
      businessId: op.businessId,
      operatorId: op.id,
      startDate: op.joiningDate ?? op.createdAt,
      status: "ACTIVE",
      monthlySalary: round2(op.defaultMonthlySalary),
    },
  });
  return [created];
}

/** True for the shape that keeps the original lifetime/month computations. */
export function isLegacyShape(periods: { status: string }[], leaves: unknown[]) {
  return periods.length === 1 && periods[0]!.status === "ACTIVE" && leaves.length === 0;
}

/** Which period a transaction dated `date` belongs to (periods sorted oldest first). */
export function derivePeriodForDate<P extends { id: string; startDate: Date }>(periods: P[], date: Date): P {
  for (let i = periods.length - 1; i >= 0; i--) {
    if (periods[i]!.startDate.getTime() <= date.getTime()) return periods[i]!;
  }
  return periods[0]!;
}

/** Re-points every transaction's workingPeriodId to the period its date falls in. Called after any change to
 * the period structure so the stored link never disagrees with the dates. */
export async function reattributeTransactions(tx: Tx, businessId: string, operatorId: string, periods: PeriodRow[]) {
  const real = periods.filter((p) => !isVirtualPeriod(p));
  let changed = 0;
  for (let i = 0; i < real.length; i++) {
    const from = i === 0 ? undefined : real[i]!.startDate;
    const to = i === real.length - 1 ? undefined : real[i + 1]!.startDate;
    const res = await tx.operatorTransaction.updateMany({
      where: {
        businessId,
        operatorId,
        NOT: { workingPeriodId: real[i]!.id },
        date: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) },
      },
      data: { workingPeriodId: real[i]!.id },
    });
    changed += res.count;
  }
  return changed;
}

/** The workingPeriodId a NEW/edited transaction dated `date` should record (null for no stored period). */
export async function resolvePeriodIdForDate(tx: Tx, op: OperatorLike, date: Date): Promise<string | null> {
  const periods = await ensureInitialPeriod(tx, op);
  return derivePeriodForDate(periods, date).id;
}

// ---------------------------------------------------------------------------
// Computation (pure)
// ---------------------------------------------------------------------------

export type TimelineEvent =
  | { type: "WORKING"; sessionNumber: number; startDate: Date; endDate: Date | null; status: string; label: string }
  | { type: "LEAVE"; leaveId: string; startDate: Date; endDate: Date; leaveType: string; label: string; reason: string | null }
  | { type: "PRESENT"; label: string };

/** One unpaid leave's share of a period's deduction, clipped to that period. */
export type LeaveDeductionLine = {
  leaveId: string;
  from: Date;
  /** Inclusive, as the owner entered it. */
  to: Date;
  days: number;
  amount: number;
  reason: string | null;
};

export type PeriodMetrics = {
  id: string;
  sessionNumber: number;
  version: number;
  startDate: Date;
  endDate: Date | null;
  status: string;
  /** Monthly Salary at that time. */
  monthlySalary: number;
  salaryBasisDays: number;
  /** monthlySalary / salaryBasisDays — informational; accrual uses the anniversary-cycle engine. */
  dailySalaryRate: number;
  totalPayableDays: number;
  salaryEarned: number;
  /** The part of salaryEarned that is paid-leave salary. */
  paidLeaveSalary: number;
  /** Taken off salaryEarned for unpaid leave recorded inside this period. */
  unpaidLeaveDeduction: number;
  /** The leaves that deduction is made of, so it can be explained rather than
   * just shown. Empty when nothing was deducted. */
  unpaidLeaveLines: LeaveDeductionLine[];
  bonus: number;
  salaryDeducted: number;
  salaryPaid: number;
  /** Previous Balance Carried Forward (opening balance). */
  previousBalance: number;
  totalPayable: number;
  pending: number;
  closingBalance: number;
  /** pending counted in operator-level totals (a carried period contributes only changes made after the transfer). */
  countedPending: number;
  openingSourcePeriodId: string | null;
  openingSourceSession: number | null;
  carriedToPeriodId: string | null;
  carriedToSession: number | null;
  balanceCarried: boolean;
  notes: string | null;
  createdAt: Date;
  closedAt: Date | null;
  accrual: AccrualBreakdown;
};

export type OperatorPeriodSummary = {
  totalOutstanding: number;
  currentSessionPending: number;
  previousSessionsPending: number;
  totalSalaryPaid: number;
  totalSalaryEarned: number;
  totalBonus: number;
  totalDeductions: number;
  activePeriodId: string | null;
  sessionCount: number;
};

export type PeriodCalculation = {
  periods: PeriodMetrics[];
  summary: OperatorPeriodSummary;
  leaves: (LeaveRow & { days: number })[];
  timeline: TimelineEvent[];
  /** Counted transactions grouped by period id. */
  txByPeriod: Map<string, PeriodTx[]>;
  /** Un-rounded totals for callers that need the exact figures. `earned` is
   * already net of `unpaidLeave`, which is carried separately so the figure
   * can be shown rather than silently folded in. */
  exact: {
    earned: Decimal;
    bonus: Decimal;
    deductions: Decimal;
    paid: Decimal;
    outstanding: Decimal;
    unpaidLeave: Decimal;
  };
};

export function calculateOperatorPeriods(
  periodRows: PeriodRow[],
  leaves: LeaveRow[],
  txs: PeriodTx[],
  now: Date = new Date(),
): PeriodCalculation {
  const periods = [...periodRows].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const byId = new Map(periods.map((p) => [p.id, p]));
  const sessionOf = new Map(periods.map((p, i) => [p.id, i + 1]));
  const carriedTo = new Map<string, PeriodRow>();
  for (const p of periods) if (p.openingSourcePeriodId) carriedTo.set(p.openingSourcePeriodId, p);

  // Same window as the legacy lifetime figure: from the first period's start through today.
  const firstStart = periods[0]!.startDate;
  const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const txByPeriod = new Map<string, PeriodTx[]>();
  const totalsByPeriod = new Map<string, ReturnType<typeof emptyTotals>>();
  for (const p of periods) {
    txByPeriod.set(p.id, []);
    totalsByPeriod.set(p.id, emptyTotals());
  }
  for (const tx of txs) {
    if (tx.date < firstStart || tx.date >= rangeEnd) continue;
    const owner = (tx.workingPeriodId && byId.get(tx.workingPeriodId)) || derivePeriodForDate(periods, tx.date);
    txByPeriod.get(owner.id)!.push(tx);
    applyTransaction(totalsByPeriod.get(owner.id)!, tx);
  }

  // Half-open day spans, so "inside" is unambiguous at both ends.
  type Span = { from: Date; to: Date };
  const periodSpan = (p: PeriodRow): Span => ({ from: p.startDate, to: p.endDate ? addDays(p.endDate, 1) : now });
  const leaveSpan = (l: LeaveRow): Span => ({ from: l.startDate, to: addDays(l.endDate, 1) });
  const intersect = (a: Span, b: Span): Span | null => {
    const from = dayIndex(a.from) > dayIndex(b.from) ? a.from : b.from;
    const to = dayIndex(a.to) < dayIndex(b.to) ? a.to : b.to;
    return dayIndex(from) < dayIndex(to) ? { from, to } : null;
  };
  /** The parts of `span` that fall in no working period at all. */
  const outsidePeriods = (span: Span): Span[] => {
    let parts: Span[] = [span];
    for (const p of periods) {
      const ps = periodSpan(p);
      const next: Span[] = [];
      for (const part of parts) {
        if (dayIndex(part.from) < dayIndex(ps.from)) {
          next.push({ from: part.from, to: dayIndex(part.to) < dayIndex(ps.from) ? part.to : ps.from });
        }
        if (dayIndex(part.to) > dayIndex(ps.to)) {
          next.push({ from: dayIndex(part.from) > dayIndex(ps.to) ? part.from : ps.to, to: part.to });
        }
      }
      parts = next.filter((x) => dayIndex(x.from) < dayIndex(x.to));
    }
    return parts;
  };

  // PAID leave in a GAP accrues at the preceding period's monthly salary (same
  // engine). Days that fall inside a working period are skipped: the period is
  // already paying for them, so counting them here would pay twice.
  const paidLeaveByPeriod = new Map<string, Decimal>();
  for (const leave of leaves) {
    if (leave.type !== "PAID") continue;
    let prev: PeriodRow | null = null;
    for (const p of periods) {
      if (p.endDate && dayIndex(p.endDate) < dayIndex(leave.startDate)) prev = p;
    }
    if (!prev) continue;
    for (const part of outsidePeriods(leaveSpan(leave))) {
      const accrual = accrueBaseSalary(part.from, part.to, dec(prev.monthlySalary));
      paidLeaveByPeriod.set(prev.id, (paidLeaveByPeriod.get(prev.id) ?? ZERO).plus(accrual.totalExact));
    }
  }

  // UNPAID leave recorded INSIDE a working period takes those days back off
  // that period: the period accrues across its whole span, so without this it
  // would pay for days the operator did not work. Days in a gap need nothing —
  // a gap accrues nothing to begin with.
  const unpaidLeaveByPeriod = new Map<string, Decimal>();
  const unpaidLinesByPeriod = new Map<string, LeaveDeductionLine[]>();
  for (const leave of leaves) {
    if (leave.type === "PAID") continue;
    for (const p of periods) {
      const hit = intersect(leaveSpan(leave), periodSpan(p));
      if (!hit) continue;
      const accrual = accrueBaseSalary(hit.from, hit.to, dec(p.monthlySalary));
      unpaidLeaveByPeriod.set(p.id, (unpaidLeaveByPeriod.get(p.id) ?? ZERO).plus(accrual.totalExact));
      const lines = unpaidLinesByPeriod.get(p.id) ?? [];
      // Dates are the CLIPPED ones: a leave running past the session's end only
      // costs the part inside it, and that is what the owner should be shown.
      lines.push({
        leaveId: leave.id,
        from: hit.from,
        to: addDays(hit.to, -1),
        days: dayIndex(hit.to) - dayIndex(hit.from),
        amount: toMoney(accrual.totalExact),
        reason: leave.reason,
      });
      unpaidLinesByPeriod.set(p.id, lines);
    }
  }

  type Calc = { row: PeriodRow; earned: Decimal; pending: Decimal; accrual: ReturnType<typeof accrueBaseSalary>; asOf: Date };
  const calcs: Calc[] = periods.map((p) => {
    const asOf = p.endDate ? addDays(p.endDate, 1) : now;
    const accrual = accrueBaseSalary(p.startDate, asOf, dec(p.monthlySalary));
    const earned = accrual.totalExact
      .plus(paidLeaveByPeriod.get(p.id) ?? ZERO)
      .minus(unpaidLeaveByPeriod.get(p.id) ?? ZERO);
    const t = totalsByPeriod.get(p.id)!;
    const pending = earned.plus(t.bonus).minus(t.deductions).plus(dec(p.openingBalance)).minus(t.paid);
    return { row: p, earned, pending, accrual, asOf };
  });

  const metrics: PeriodMetrics[] = calcs.map(({ row: p, earned, pending, accrual, asOf }) => {
    const t = totalsByPeriod.get(p.id)!;
    const next = carriedTo.get(p.id) ?? null;
    const pendingRounded = round2(pending);
    // A carried period's pending now lives in the next period's openingBalance; only later changes still count.
    const counted = next ? pendingRounded.minus(dec(next.openingBalance)) : pendingRounded;
    const monthly = dec(p.monthlySalary);
    return {
      id: p.id,
      sessionNumber: sessionOf.get(p.id)!,
      version: p.version,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      monthlySalary: toMoney(monthly),
      salaryBasisDays: p.salaryBasisDays,
      dailySalaryRate: toMoney(p.salaryBasisDays > 0 ? monthly.div(p.salaryBasisDays) : ZERO),
      totalPayableDays: Math.max(0, dayIndex(asOf) - dayIndex(p.startDate)),
      salaryEarned: toMoney(earned),
      paidLeaveSalary: toMoney(paidLeaveByPeriod.get(p.id) ?? ZERO),
      unpaidLeaveDeduction: toMoney(unpaidLeaveByPeriod.get(p.id) ?? ZERO),
      unpaidLeaveLines: unpaidLinesByPeriod.get(p.id) ?? [],
      bonus: toMoney(t.bonus),
      salaryDeducted: toMoney(t.deductions),
      salaryPaid: toMoney(t.paid),
      previousBalance: toMoney(dec(p.openingBalance)),
      totalPayable: toMoney(earned.plus(t.bonus).minus(t.deductions).plus(dec(p.openingBalance))),
      pending: toMoney(pending),
      closingBalance: toMoney(pending),
      countedPending: counted.toNumber(),
      openingSourcePeriodId: p.openingSourcePeriodId,
      openingSourceSession: p.openingSourcePeriodId ? (sessionOf.get(p.openingSourcePeriodId) ?? null) : null,
      carriedToPeriodId: next?.id ?? null,
      carriedToSession: next ? (sessionOf.get(next.id) ?? null) : null,
      balanceCarried: next !== null,
      notes: p.notes,
      createdAt: p.createdAt,
      closedAt: p.closedAt,
      accrual: presentAccrual(accrual),
    };
  });

  const active = metrics.find((m) => m.status === "ACTIVE") ?? null;
  const sum = (f: (m: PeriodMetrics) => number) => metrics.reduce((acc, m) => acc.plus(dec(f(m))), ZERO);
  const totalOutstanding = sum((m) => m.countedPending);
  const currentSessionPending = active ? dec(active.countedPending) : ZERO;
  const exactEarned = calcs.reduce((acc, c) => acc.plus(c.earned), ZERO);
  let bonus = ZERO;
  let deductions = ZERO;
  let paid = ZERO;
  for (const t of totalsByPeriod.values()) {
    bonus = bonus.plus(t.bonus);
    deductions = deductions.plus(t.deductions);
    paid = paid.plus(t.paid);
  }

  const summary: OperatorPeriodSummary = {
    totalOutstanding: toMoney(totalOutstanding),
    currentSessionPending: toMoney(currentSessionPending),
    previousSessionsPending: toMoney(totalOutstanding.minus(currentSessionPending)),
    totalSalaryPaid: toMoney(paid),
    totalSalaryEarned: toMoney(exactEarned),
    totalBonus: toMoney(bonus),
    totalDeductions: toMoney(deductions),
    activePeriodId: active?.id ?? null,
    sessionCount: periods.length,
  };

  // Timeline: working periods and leaves in date order, then "Present" while a period is active.
  const events: (TimelineEvent & { sort: number })[] = [];
  for (const m of metrics) {
    events.push({
      type: "WORKING",
      sessionNumber: m.sessionNumber,
      startDate: m.startDate,
      endDate: m.endDate,
      status: m.status,
      label: `Session #${m.sessionNumber} Working`,
      sort: m.startDate.getTime(),
    });
  }
  for (const l of leaves) {
    events.push({
      type: "LEAVE",
      leaveId: l.id,
      startDate: l.startDate,
      endDate: l.endDate,
      leaveType: l.type,
      reason: l.reason,
      label: l.type === "PAID" ? "Leave (Paid)" : "Leave (Unpaid)",
      sort: l.startDate.getTime(),
    });
  }
  events.sort((a, b) => a.sort - b.sort);
  const timeline: TimelineEvent[] = events.map(({ sort: _s, ...rest }) => {
    void _s;
    return rest as TimelineEvent;
  });
  if (active) timeline.push({ type: "PRESENT", label: "Present" });

  return {
    periods: metrics,
    summary,
    leaves: leaves.map((l) => ({ ...l, days: daysBetweenInclusive(l.startDate, l.endDate) })),
    timeline,
    txByPeriod,
    exact: {
      earned: exactEarned,
      bonus,
      deductions,
      paid,
      outstanding: totalOutstanding,
      unpaidLeave: [...unpaidLeaveByPeriod.values()].reduce((acc, v) => acc.plus(v), ZERO),
    },
  };
}

/** Everything the period screens need for one operator, as of now. */
export async function getOperatorPeriodsOverview(businessId: string, operatorId: string, now = new Date()) {
  const operator = await db.operator.findFirst({ where: { id: operatorId, businessId } });
  if (!operator) return null;
  const { periods, leaves, virtual } = await loadPeriodContext(db, operator);
  const txs = await db.operatorTransaction.findMany({
    where: { businessId, operatorId },
    select: { id: true, date: true, amount: true, businessEffect: true, deductFromSalary: true, workingPeriodId: true },
  });
  const calc = calculateOperatorPeriods(periods, leaves, txs, now);
  const active = calc.periods.find((p) => p.status === "ACTIVE") ?? null;
  return {
    operator: { id: operator.id, name: operator.name, joiningDate: operator.joiningDate ?? operator.createdAt },
    summary: calc.summary,
    periods: calc.periods,
    leaves: calc.leaves,
    timeline: calc.timeline,
    activePeriod: active,
    /** True while the operator has no stored period row yet (shown as one ACTIVE period). */
    implicit: virtual,
    asOf: now,
  };
}

// ---------------------------------------------------------------------------
// Session details
// ---------------------------------------------------------------------------

const TX_LABEL: Record<string, string> = {
  SALARY_PAYMENT: "Salary Payment",
  ADVANCE_RECOVERABLE: "Salary Advance",
  BUSINESS_EXPENSE: "Deduction",
  BONUS_INCENTIVE: "Bonus",
  OTHER: "Adjustment",
};

export type PeriodLine = {
  kind: "ACCRUAL" | "PAID_LEAVE" | "PREVIOUS_BALANCE" | "TRANSACTION";
  id: string | null;
  date: Date | null;
  type: string;
  /** Always positive; `effect` says which way it moves the pending amount. */
  amount: number;
  effect: "ADDS" | "SUBTRACTS" | "NONE";
  description: string;
  referenceSession: number | null;
  createdBy: string | null;
};

export async function getPeriodDetails(businessId: string, operatorId: string, periodId: string, now = new Date()) {
  const operator = await db.operator.findFirst({ where: { id: operatorId, businessId } });
  if (!operator) return null;
  const { periods, leaves } = await loadPeriodContext(db, operator);
  if (!periods.some((p) => p.id === periodId)) return null;

  const txRows = await db.operatorTransaction.findMany({
    where: { businessId, operatorId },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    include: { category: { select: { name: true } } },
  });
  const calc = calculateOperatorPeriods(periods, leaves, txRows, now);
  const period = calc.periods.find((p) => p.id === periodId)!;
  const counted = new Set((calc.txByPeriod.get(periodId) ?? []).map((t) => t.id));
  const own = txRows.filter((t) => t.id && counted.has(t.id));

  const creators = own.length
    ? await db.auditLog.findMany({
        where: {
          businessId,
          entityType: "OperatorTransaction",
          action: "operator.transaction.create",
          entityId: { in: own.map((t) => t.id) },
        },
        select: { entityId: true, userName: true },
      })
    : [];
  const creatorOf = new Map(creators.map((c) => [c.entityId, c.userName]));

  const lines: PeriodLine[] = [];
  if (period.openingSourcePeriodId) {
    lines.push({
      kind: "PREVIOUS_BALANCE",
      id: null,
      date: period.startDate,
      type: "Previous Balance",
      amount: period.previousBalance,
      effect: "ADDS",
      description: `Carried forward from Session #${period.openingSourceSession ?? "?"}`,
      referenceSession: period.openingSourceSession,
      createdBy: null,
    });
  }
  lines.push({
    kind: "ACCRUAL",
    id: null,
    date: period.startDate,
    type: "Salary Accrued",
    amount: toMoney(dec(period.salaryEarned).minus(period.paidLeaveSalary)),
    effect: "ADDS",
    description: `${period.totalPayableDays} day(s) at ${period.monthlySalary} per month`,
    referenceSession: period.sessionNumber,
    createdBy: null,
  });
  if (period.paidLeaveSalary > 0) {
    lines.push({
      kind: "PAID_LEAVE",
      id: null,
      date: period.endDate,
      type: "Paid Leave Salary",
      amount: period.paidLeaveSalary,
      effect: "ADDS",
      description: "Salary for paid leave days after this session",
      referenceSession: period.sessionNumber,
      createdBy: null,
    });
  }
  for (const t of own) {
    const adds = t.businessEffect === "BONUS_INCENTIVE";
    const subtracts = t.businessEffect === "SALARY_PAYMENT" || t.deductFromSalary;
    lines.push({
      kind: "TRANSACTION",
      id: t.id,
      date: t.date,
      type: TX_LABEL[t.businessEffect] ?? "Adjustment",
      amount: dec(t.amount).toNumber(),
      effect: adds ? "ADDS" : subtracts ? "SUBTRACTS" : "NONE",
      description: [t.category?.name, t.notes].filter(Boolean).join(" - "),
      referenceSession: period.sessionNumber,
      createdBy: creatorOf.get(t.id) ?? "Admin",
    });
  }
  return { operator: { id: operator.id, name: operator.name }, period, lines, summary: calc.summary, asOf: now };
}
