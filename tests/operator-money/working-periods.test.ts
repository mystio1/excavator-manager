import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { dec } from "@/lib/money";
import { clearBusinessData } from "@/lib/services/support";
import { updateOperator } from "@/lib/services/operators";
import { computeSalaryForMonth, getLifetimeSalaryBreakdown, getLifetimeSalarySummary } from "@/lib/services/salary";
import { accrueBaseSalary, toMoney } from "@/lib/services/salaryCore";
import { startWorkingPeriod, createLeave } from "@/lib/services/workingPeriodActions";
import { ensureInitialPeriod, getOperatorPeriodsOverview, getPeriodDetails } from "@/lib/services/workingPeriods";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { actAs } from "../bills/session-mock";
import { body, ctx, req, type ErrorBody } from "../bills/route-helpers";

vi.mock("@/lib/session", () => import("../bills/session-mock"));

import { GET as getPeriods, POST as postPeriod } from "@/app/api/operators/[id]/periods/route";
import { GET as getPeriod, PATCH as patchPeriod } from "@/app/api/operators/[id]/periods/[periodId]/route";
import { GET as getLeaves, POST as postLeave } from "@/app/api/operators/[id]/leaves/route";
import { DELETE as deleteLeaveRoute } from "@/app/api/operators/[id]/leaves/[leaveId]/route";
import { POST as postTx } from "@/app/api/operators/[id]/transactions/route";
import { PATCH as patchTxItem } from "@/app/api/operators/[id]/transactions/[transactionId]/route";

/**
 * Working periods ("salary sessions"): the owner's scenario end to end.
 * Operator joins 2026-03-03 at 30,000/month. Session #1 runs to 2026-08-26 (CLOSED), unpaid leave
 * 2026-08-27 -> 2026-09-13, Session #2 starts 2026-09-14 (ACTIVE, "present" = 2026-10-08).
 * All dates are LOCAL-time constructors so the suite is timezone independent.
 */

let t: TestTenant;
let other: TestTenant;

const NOW = new Date(2026, 9, 8, 12);
const JOIN = new Date(2026, 2, 3);
const S1_END = new Date(2026, 7, 26);
const S2_START = new Date(2026, 8, 14);

/** Session #1's earned amount straight from the engine (end inclusive -> as of the next day). */
const earned1 = () => toMoney(accrueBaseSalary(JOIN, new Date(2026, 7, 27), dec(30000)).totalExact);
const earned2 = () => toMoney(accrueBaseSalary(S2_START, NOW, dec(30000)).totalExact);

beforeAll(async () => {
  t = await createTenant("periods");
  other = await createTenant("periods-other");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await cleanupTenant(other.businessId);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  actAs(t);
});

afterEach(() => {
  vi.useRealTimers();
  actAs(null);
});

async function newOperator(name = "Example Operator", salary = "30000", joining = JOIN) {
  return db.operator.create({
    data: { businessId: t.businessId, name, mobile: "9444444444", defaultMonthlySalary: salary, joiningDate: joining },
  });
}

const ids = (operatorId: string) => ({ id: operatorId });
const jsonOf = async <T>(res: Response) => body<T>(res);

async function addPayment(operatorId: string, date: string, amount: number, effect = "SALARY_PAYMENT") {
  const res = await postTx(
    req("POST", `/api/operators/${operatorId}/transactions`, {
      body: { amount, date, businessEffect: effect, deductFromSalary: true },
    }),
    ctx(ids(operatorId)),
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { transaction: { id: string; workingPeriodId: string | null } };
}

function startBody(over: Record<string, unknown> = {}) {
  return {
    startDate: "2026-09-14",
    previousEndDate: "2026-08-26",
    reason: "RETURNED_FROM_LEAVE",
    leaveType: "UNPAID",
    carryForward: true,
    ...over,
  };
}

async function start(operatorId: string, payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  return postPeriod(req("POST", `/api/operators/${operatorId}/periods`, { body: payload, headers }), ctx(ids(operatorId)));
}

/** Operator + one payment inside session #1 so that its pending is exactly 26,000. */
async function scenarioBeforeSession2() {
  const op = await newOperator();
  await addPayment(op.id, "2026-08-20", earned1() - 26000);
  return op;
}

describe("the owner's scenario", () => {
  it("Session #1 pending is exactly 26,000 before anything else happens", async () => {
    const op = await scenarioBeforeSession2();
    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    // Still one ACTIVE period (not yet closed): earned runs to today, so close it first to compare.
    expect(ov.periods).toHaveLength(1);
    const res = await patchPeriod(
      req("PATCH", `/api/operators/${op.id}/periods/${ov.periods[0]!.id}`, { body: { close: true, endDate: "2026-08-26" } }),
      ctx({ id: op.id, periodId: ov.periods[0]!.id }),
    );
    expect(res.status).toBe(200);
    const closed = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    const s1 = closed.periods[0]!;
    expect(s1.status).toBe("CLOSED");
    expect(s1.salaryEarned).toBe(earned1());
    expect(s1.pending).toBe(26000);
  });

  it("carry forward = true: opening 26,000 linked to session 1, counted once, session 1 history unchanged", async () => {
    const op = await scenarioBeforeSession2();
    const res = await start(op.id, startBody({ carryForward: true }));
    expect(res.status).toBe(201);
    const out = await jsonOf<{ carriedForward: number; previousPending: number; leave: { type: string } }>(res);
    expect(out.previousPending).toBe(26000);
    expect(out.carriedForward).toBe(26000);
    expect(out.leave.type).toBe("UNPAID");

    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    const [s1, s2] = ov.periods;
    expect(s1!.status).toBe("CLOSED");
    expect(s1!.endDate).toEqual(S1_END);
    expect(s1!.salaryEarned).toBe(earned1()); // unchanged by creating session 2
    expect(s1!.pending).toBe(26000); // history keeps its own numbers
    expect(s1!.balanceCarried).toBe(true);
    expect(s1!.carriedToSession).toBe(2);
    expect(s2!.status).toBe("ACTIVE");
    expect(s2!.previousBalance).toBe(26000);
    expect(s2!.openingSourcePeriodId).toBe(s1!.id);
    expect(s2!.openingSourceSession).toBe(1);
    expect(s2!.salaryEarned).toBe(earned2()); // the 26,000 is NOT new salary
    expect(s2!.pending).toBeCloseTo(earned2() + 26000, 2);

    // Unpaid leave accrues nothing: total earned is exactly session 1 + session 2.
    expect(ov.summary.totalSalaryEarned).toBeCloseTo(earned1() + earned2(), 2);
    // 26,000 is counted once (inside session 2), not twice.
    expect(ov.summary.previousSessionsPending).toBe(0);
    expect(ov.summary.currentSessionPending).toBeCloseTo(earned2() + 26000, 2);
    expect(ov.summary.totalOutstanding).toBeCloseTo(earned2() + 26000, 2);

    // The gap was recorded as an unpaid leave 27 Aug -> 13 Sep.
    expect(ov.leaves).toHaveLength(1);
    expect(ov.leaves[0]).toMatchObject({ type: "UNPAID", days: 18 });
    expect(ov.leaves[0]!.startDate).toEqual(new Date(2026, 7, 27));
    expect(ov.leaves[0]!.endDate).toEqual(new Date(2026, 8, 13));
    expect(ov.timeline.map((e) => e.label)).toEqual(["Session #1 Working", "Leave (Unpaid)", "Session #2 Working", "Present"]);

    // Lifetime figures follow the period totals for a multi-period operator.
    const lifetime = await getLifetimeSalarySummary(t.businessId, op.id);
    expect(lifetime.multiPeriod).toBe(true);
    expect(lifetime.remaining).toBe(ov.summary.totalOutstanding);
    const breakdown = await getLifetimeSalaryBreakdown(t.businessId);
    expect(breakdown.find((r) => r.operatorId === op.id)!.remaining).toBe(ov.summary.totalOutstanding);
  });

  it("carry forward = false: opening 0 and session 1's 26,000 is counted exactly once", async () => {
    const op = await scenarioBeforeSession2();
    const res = await start(op.id, startBody({ carryForward: false }));
    expect(res.status).toBe(201);
    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    const [s1, s2] = ov.periods;
    expect(s2!.previousBalance).toBe(0);
    expect(s2!.openingSourcePeriodId).toBeNull();
    expect(s1!.balanceCarried).toBe(false);
    expect(s1!.pending).toBe(26000);
    expect(s2!.pending).toBe(earned2());
    expect(ov.summary.previousSessionsPending).toBe(26000);
    expect(ov.summary.totalOutstanding).toBeCloseTo(earned2() + 26000, 2);
  });

  it("asks for a carry decision only when something is owed", async () => {
    const op = await scenarioBeforeSession2();
    const res = await start(op.id, startBody({ carryForward: undefined }));
    expect(res.status).toBe(400);
    // Nothing was written by the refused request.
    expect(await db.operatorWorkingPeriod.count({ where: { operatorId: op.id, status: "ACTIVE" } })).toBe(1);

    // Preview says how much would be carried.
    const prev = await getPeriods(
      req("GET", `/api/operators/${op.id}/periods?previewStart=2026-09-14&previewEnd=2026-08-26`),
      ctx(ids(op.id)),
    );
    expect(prev.status).toBe(200);
    const preview = await jsonOf<{ preview: { pending: number; needsCarryDecision: boolean; gapDays: number } }>(prev);
    expect(preview.preview).toMatchObject({ pending: 26000, needsCarryDecision: true, gapDays: 18 });

    // Fully paid (overpaid) previous period: no prompt, nothing carried, even when carryForward: true is sent.
    const paid = await newOperator("Paid Up");
    await addPayment(paid.id, "2026-08-20", earned1() + 100);
    const ok = await start(paid.id, startBody({ carryForward: undefined }));
    expect(ok.status).toBe(201);
    const ov = (await getOperatorPeriodsOverview(t.businessId, paid.id, NOW))!;
    expect(ov.periods[1]!.previousBalance).toBe(0);
    expect(ov.periods[0]!.pending).toBe(-100);
    expect(ov.periods[0]!.balanceCarried).toBe(false);
  });

  it("a period can be carried only once (unique source + server check)", async () => {
    const op = await scenarioBeforeSession2();
    expect((await start(op.id, startBody())).status).toBe(201);
    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    await expect(
      db.operatorWorkingPeriod.create({
        data: {
          businessId: t.businessId,
          operatorId: op.id,
          startDate: new Date(2027, 0, 1),
          status: "CLOSED",
          endDate: new Date(2027, 0, 2),
          openingBalance: 26000,
          openingSourcePeriodId: ov.periods[0]!.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("is idempotent: the same Idempotency-Key replays instead of starting a second period", async () => {
    const op = await scenarioBeforeSession2();
    const key = { "idempotency-key": `period-${op.id}` };
    const a = await start(op.id, startBody(), key);
    const b = await start(op.id, startBody(), key);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.headers.get("Idempotent-Replay")).toBe("true");
    expect(await db.operatorWorkingPeriod.count({ where: { operatorId: op.id } })).toBe(2);
    expect(await db.operatorLeave.count({ where: { operatorId: op.id } })).toBe(1);
  });

  it("is audited", async () => {
    const op = await scenarioBeforeSession2();
    await start(op.id, startBody());
    const rows = await db.auditLog.findMany({
      where: { businessId: t.businessId, action: { in: ["operator.period.start", "operator.period.close", "operator.leave.create"] } },
    });
    const actions = new Set(rows.filter((r) => (r.details as { operatorId?: string }).operatorId === op.id).map((r) => r.action));
    expect(actions).toEqual(new Set(["operator.period.start", "operator.period.close", "operator.leave.create"]));
  });
});

describe("validation", () => {
  it("never allows two ACTIVE periods (database + service)", async () => {
    const op = await scenarioBeforeSession2();
    await start(op.id, startBody({ carryForward: false }));
    await expect(
      db.operatorWorkingPeriod.create({
        data: { businessId: t.businessId, operatorId: op.id, startDate: new Date(2027, 0, 1), status: "ACTIVE" },
      }),
    ).rejects.toThrow();
    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    expect(ov.periods.filter((p) => p.status === "ACTIVE")).toHaveLength(1);
  });

  it("rejects overlapping / out-of-order / invalid dates and writes nothing", async () => {
    const op = await scenarioBeforeSession2();
    const cases: Record<string, unknown>[] = [
      { startDate: "2026-03-03", previousEndDate: undefined }, // not after the previous start
      { startDate: "2026-02-01" }, // before the previous start
      { startDate: "2026-09-14", previousEndDate: "2026-09-14" }, // ends on/after the new start (overlap)
      { startDate: "2026-09-14", previousEndDate: "2026-03-01" }, // ends before it started
    ];
    for (const c of cases) {
      const res = await start(op.id, startBody({ carryForward: false, ...c }));
      expect(res.status, JSON.stringify(c)).toBe(422);
      expect((await jsonOf<ErrorBody>(res)).code).toBe("VALIDATION_FAILED");
    }
    const bad = await start(op.id, startBody({ startDate: "not-a-date" }));
    expect(bad.status).toBe(422);
    expect(await db.operatorWorkingPeriod.count({ where: { operatorId: op.id } })).toBe(1);
    expect(await db.operatorLeave.count({ where: { operatorId: op.id } })).toBe(0);
    expect((await db.operatorWorkingPeriod.findFirstOrThrow({ where: { operatorId: op.id } })).status).toBe("ACTIVE");
  });

  it("leaves must sit in a gap: no overlap with a period or another leave", async () => {
    const op = await scenarioBeforeSession2();
    await start(op.id, startBody({ carryForward: false }));
    const post = (b: Record<string, unknown>) =>
      postLeave(req("POST", `/api/operators/${op.id}/leaves`, { body: b }), ctx(ids(op.id)));
    expect((await post({ startDate: "2026-09-01", endDate: "2026-09-05" })).status).toBe(409); // inside the gap leave
    expect((await post({ startDate: "2026-09-20", endDate: "2026-09-22" })).status).toBe(409); // inside session 2
    expect((await post({ startDate: "2026-05-01", endDate: "2026-05-02" })).status).toBe(409); // inside session 1
    expect((await post({ startDate: "2026-12-05", endDate: "2026-12-01" })).status).toBe(422); // end < start
    expect(await db.operatorLeave.count({ where: { operatorId: op.id } })).toBe(1);
  });

  it("stale expectedVersion on a period edit is refused", async () => {
    const op = await scenarioBeforeSession2();
    await start(op.id, startBody({ carryForward: false }));
    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    const s2 = ov.periods[1]!;
    const patch = (b: Record<string, unknown>) =>
      patchPeriod(
        req("PATCH", `/api/operators/${op.id}/periods/${s2.id}`, { body: b }),
        ctx({ id: op.id, periodId: s2.id }),
      );
    const ok = await patch({ notes: "back from village", expectedVersion: s2.version });
    expect(ok.status).toBe(200);
    const stale = await patch({ notes: "again", expectedVersion: s2.version });
    expect(stale.status).toBe(409);
    expect((await jsonOf<ErrorBody>(stale)).code).toBe("RESOURCE_MODIFIED");
  });

  it("dates of a carried-from period are locked; the first period start is not editable here", async () => {
    const op = await scenarioBeforeSession2();
    await start(op.id, startBody({ carryForward: true }));
    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    const [s1, s2] = ov.periods;
    const patch = (periodId: string, b: Record<string, unknown>) =>
      patchPeriod(req("PATCH", `/api/operators/${op.id}/periods/${periodId}`, { body: b }), ctx({ id: op.id, periodId }));
    expect((await patch(s1!.id, { endDate: "2026-08-20" })).status).toBe(409);
    expect((await patch(s1!.id, { startDate: "2026-04-01" })).status).toBe(409);
    expect((await patch(s2!.id, { startDate: "2026-08-01" })).status).toBe(422);
  });
});

describe("closing without a new period, and paid leave", () => {
  it("Close Working Period stops accrual; more time passing changes nothing", async () => {
    const op = await newOperator("Stopped", "30000", new Date(2026, 5, 1));
    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    expect(ov.implicit).toBe(true);
    const id = ov.periods[0]!.id;
    expect(id.startsWith("virtual-")).toBe(true);
    // The virtual id is not addressable; the real (lazily created) one is.
    const real = await db.$transaction((tx) => ensureInitialPeriod(tx, op));
    const res = await patchPeriod(
      req("PATCH", `/api/operators/${op.id}/periods/${real[0]!.id}`, { body: { close: true, endDate: "2026-07-31" } }),
      ctx({ id: op.id, periodId: real[0]!.id }),
    );
    expect(res.status).toBe(200);
    const expected = toMoney(accrueBaseSalary(new Date(2026, 5, 1), new Date(2026, 7, 1), dec(30000)).totalExact);
    expect((await getLifetimeSalarySummary(t.businessId, op.id)).remaining).toBe(expected);
    vi.setSystemTime(new Date(2027, 0, 15, 12));
    expect((await getLifetimeSalarySummary(t.businessId, op.id)).remaining).toBe(expected);
  });

  it("paid leave accrues at the preceding period's rate; unpaid leave accrues 0", async () => {
    const op = await newOperator("Paid Leave", "30000", new Date(2026, 3, 1));
    const res = await startWorkingPeriod(t.businessId, t.actor, op.id, {
      startDate: "2026-06-01",
      previousEndDate: "2026-04-30",
      leaveType: "PAID",
      carryForward: false,
    });
    expect("error" in res).toBe(false);
    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    const s1 = ov.periods[0]!;
    const base = toMoney(accrueBaseSalary(new Date(2026, 3, 1), new Date(2026, 4, 1), dec(30000)).totalExact);
    const leave = toMoney(accrueBaseSalary(new Date(2026, 4, 1), new Date(2026, 5, 1), dec(30000)).totalExact);
    expect(s1.paidLeaveSalary).toBe(leave);
    expect(s1.salaryEarned).toBeCloseTo(base + leave, 2);

    const details = (await getPeriodDetails(t.businessId, op.id, s1.id, NOW))!;
    expect(details.lines.map((l) => l.type)).toContain("Paid Leave Salary");
  });

  it("a month entirely inside an unpaid gap (or before joining) accrues nothing in the month tab", async () => {
    const op = await newOperator("Gap Months", "30000", new Date(2026, 0, 10));
    await startWorkingPeriod(t.businessId, t.actor, op.id, {
      startDate: "2026-07-01",
      previousEndDate: "2026-04-30",
      leaveType: "UNPAID",
      carryForward: false,
    });
    const may = await computeSalaryForMonth(t.businessId, op.id, 2026, 4);
    const apr = await computeSalaryForMonth(t.businessId, op.id, 2026, 3);
    const jul = await computeSalaryForMonth(t.businessId, op.id, 2026, 6);
    const dec2025 = await computeSalaryForMonth(t.businessId, op.id, 2025, 11);
    expect(apr.baseSalary).toBe(30000);
    expect(may.baseSalary).toBe(0);
    expect(may.payable).toBe(apr.payable); // nothing added by May
    expect(jul.baseSalary).toBe(30000);
    expect(dec2025.baseSalary).toBe(0);
  });
});

describe("salary paid while the operator is on holiday", () => {
  /** The owner's example: session 1 closes owing 10,000; 2,000 is paid during the
   * holiday and still belongs to session 1; the remaining 8,000 carries into session 2. */
  it("counts the holiday payment in the closed session and carries only the remainder", async () => {
    const op = await newOperator();
    await addPayment(op.id, "2026-08-20", earned1() - 10000);

    const before = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    const period1 = before.periods[0]!;
    const closed = await patchPeriod(
      req("PATCH", `/api/operators/${op.id}/periods/${period1.id}`, { body: { close: true, endDate: "2026-08-26" } }),
      ctx({ id: op.id, periodId: period1.id }),
    );
    expect(closed.status).toBe(200);
    expect((await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!.periods[0]!.pending).toBe(10000);

    // Paid during the gap — after session 1 ended, before session 2 exists.
    const holidayPay = await addPayment(op.id, "2026-09-05", 2000);
    expect(holidayPay.transaction.workingPeriodId).toBe(period1.id);

    const afterPay = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    expect(afterPay.periods).toHaveLength(1);
    expect(afterPay.periods[0]!.pending).toBe(8000);
    expect(afterPay.summary.totalOutstanding).toBe(8000);

    // Starting session 2 carries the remaining 8,000, not the original 10,000.
    const res = await start(op.id, startBody({ carryForward: true }));
    expect(res.status).toBe(201);
    expect(await jsonOf<{ previousPending: number; carriedForward: number }>(res)).toMatchObject({
      previousPending: 8000,
      carriedForward: 8000,
    });

    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    const [s1, s2] = ov.periods;
    expect(s1!.pending).toBe(8000);
    expect(s1!.balanceCarried).toBe(true);
    expect(s1!.carriedToSession).toBe(2);
    expect(s2!.previousBalance).toBe(8000);
    expect(s2!.openingSourceSession).toBe(1);
    // the holiday payment stays attributed to session 1, not pulled into session 2
    expect(ov.summary.previousSessionsPending).toBe(0);
    expect(ov.summary.totalOutstanding).toBeCloseTo(earned2() + 8000, 2);
  });
});

describe("existing operators keep their numbers", () => {
  it("an operator with no stored period (and one with the stored initial period) match the legacy figures", async () => {
    const op = await newOperator("Legacy", "30000", new Date(2026, 5, 7));
    await db.operatorTransaction.create({
      data: { businessId: t.businessId, operatorId: op.id, date: new Date(2026, 6, 2, 12), amount: "500.00", businessEffect: "SALARY_PAYMENT" },
    });
    const expectedPayable = toMoney(accrueBaseSalary(new Date(2026, 5, 7), NOW, dec(30000)).totalExact);

    const summary = await getLifetimeSalarySummary(t.businessId, op.id);
    expect(summary.multiPeriod).toBe(false);
    expect(summary.totalPayable).toBe(expectedPayable);
    expect(summary.remaining).toBe(toMoney(dec(expectedPayable).minus(500)));

    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    expect(ov.implicit).toBe(true);
    expect(ov.summary.totalOutstanding).toBe(summary.remaining);
    expect(ov.summary.totalSalaryPaid).toBe(summary.totalPaid);
    expect(ov.summary.totalSalaryEarned).toBe(summary.accrual.total);

    // Recording a transaction lazily stores the initial period; the figures do not move.
    await addPayment(op.id, "2026-07-03", 100);
    expect(await db.operatorWorkingPeriod.count({ where: { operatorId: op.id } })).toBe(1);
    const after = await getLifetimeSalarySummary(t.businessId, op.id);
    expect(after.remaining).toBe(toMoney(dec(summary.remaining).minus(100)));
    const rows = await getLifetimeSalaryBreakdown(t.businessId);
    expect(rows.find((r) => r.operatorId === op.id)!.remaining).toBe(after.remaining);
  });

  it("updateOperator keeps the active period consistent (salary, and the start while there is one period)", async () => {
    const op = await newOperator("Edited", "30000", new Date(2026, 5, 7));
    const res = await updateOperator(t.businessId, t.actor, op.id, {
      name: "Edited",
      mobile: "9444444444",
      joiningDate: "2026-06-10",
      defaultMonthlySalary: 36000,
    });
    expect("error" in res).toBe(false);
    const p = await db.operatorWorkingPeriod.findFirstOrThrow({ where: { operatorId: op.id } });
    expect(Number(p.monthlySalary)).toBe(36000);
    expect(p.startDate).toEqual(new Date("2026-06-10"));
    expect((await getLifetimeSalarySummary(t.businessId, op.id)).baseSalary).toBe(36000);

    // With a closed first period the history is left alone; only the active period follows the salary.
    await startWorkingPeriod(t.businessId, t.actor, op.id, {
      startDate: "2026-08-01",
      previousEndDate: "2026-07-15",
      carryForward: false,
    });
    await updateOperator(t.businessId, t.actor, op.id, {
      name: "Edited",
      mobile: "9444444444",
      joiningDate: "2026-06-01",
      defaultMonthlySalary: 40000,
    });
    const rows = await db.operatorWorkingPeriod.findMany({ where: { operatorId: op.id }, orderBy: { startDate: "asc" } });
    expect(rows).toHaveLength(2);
    expect(Number(rows[0]!.monthlySalary)).toBe(36000);
    expect(rows[0]!.startDate).toEqual(new Date("2026-06-10"));
    expect(Number(rows[1]!.monthlySalary)).toBe(40000);
  });

  it("addOperator-style creation: a new period starts at the operator's current salary by default", async () => {
    const op = await newOperator("Raise", "30000", new Date(2026, 3, 1));
    const res = await startWorkingPeriod(t.businessId, t.actor, op.id, {
      startDate: "2026-06-01",
      previousEndDate: "2026-04-30",
      monthlySalary: 33000,
      carryForward: false,
    });
    expect("error" in res).toBe(false);
    const fresh = await db.operator.findUniqueOrThrow({ where: { id: op.id } });
    expect(Number(fresh.defaultMonthlySalary)).toBe(33000);
    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    expect(ov.periods[0]!.monthlySalary).toBe(30000); // closed period keeps its own rate
    expect(ov.periods[1]!.monthlySalary).toBe(33000);
  });
});

describe("transactions belong to periods", () => {
  it("records the period server-side from the date and re-derives it on edit", async () => {
    const op = await scenarioBeforeSession2();
    await start(op.id, startBody({ carryForward: false }));
    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    const [s1, s2] = ov.periods;

    const inS2 = await addPayment(op.id, "2026-09-20", 1000, "ADVANCE_RECOVERABLE");
    expect(inS2.transaction.workingPeriodId).toBe(s2!.id);
    const inGap = await addPayment(op.id, "2026-08-30", 500, "SALARY_PAYMENT");
    expect(inGap.transaction.workingPeriodId).toBe(s1!.id); // a date inside the leave gap -> the preceding period

    // A client-supplied workingPeriodId is ignored.
    const spoof = await postTx(
      req("POST", `/api/operators/${op.id}/transactions`, {
        body: { amount: 10, date: "2026-09-21", businessEffect: "BONUS_INCENTIVE", workingPeriodId: s1!.id },
      }),
      ctx(ids(op.id)),
    );
    expect(spoof.status).toBe(201);
    expect((await jsonOf<{ transaction: { workingPeriodId: string } }>(spoof)).transaction.workingPeriodId).toBe(s2!.id);

    // Editing the date moves it to the other period.
    const edit = await patchTxItem(
      req("PATCH", `/api/operators/${op.id}/transactions/${inS2.transaction.id}`, {
        body: { amount: 1000, date: "2026-07-01", businessEffect: "ADVANCE_RECOVERABLE", deductFromSalary: true },
      }),
      ctx({ id: op.id, transactionId: inS2.transaction.id }),
    );
    expect(edit.status).toBe(200);
    expect((await db.operatorTransaction.findUniqueOrThrow({ where: { id: inS2.transaction.id } })).workingPeriodId).toBe(s1!.id);

    // Details: lines carry labels, the session reference and a creator.
    const detail = await getPeriod(req("GET", `/api/operators/${op.id}/periods/${s1!.id}`), ctx({ id: op.id, periodId: s1!.id }));
    expect(detail.status).toBe(200);
    const d = await jsonOf<{ lines: { type: string; createdBy: string | null; referenceSession: number | null }[] }>(detail);
    const types = d.lines.map((l) => l.type);
    expect(types).toContain("Salary Accrued");
    expect(types).toContain("Salary Payment");
    expect(types).toContain("Salary Advance");
    expect(d.lines.every((l) => l.referenceSession === 1)).toBe(true);
    expect(d.lines.find((l) => l.type === "Salary Payment")!.createdBy).toBe(t.actor.name);
  });

  it("starting a period re-points later-dated transactions to the new period", async () => {
    const op = await newOperator("Repoint", "30000", new Date(2026, 3, 1));
    const late = await addPayment(op.id, "2026-09-25", 700, "SALARY_PAYMENT");
    const first = (await db.operatorWorkingPeriod.findFirstOrThrow({ where: { operatorId: op.id } })).id;
    expect(late.transaction.workingPeriodId).toBe(first);
    await startWorkingPeriod(t.businessId, t.actor, op.id, {
      startDate: "2026-09-14",
      previousEndDate: "2026-08-31",
      carryForward: false,
    });
    const row = await db.operatorTransaction.findUniqueOrThrow({ where: { id: late.transaction.id } });
    expect(row.workingPeriodId).not.toBe(first);
    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    expect(ov.periods[1]!.salaryPaid).toBe(700);
    expect(ov.periods[0]!.salaryPaid).toBe(0);
  });
});

describe("leaves API", () => {
  it("creates and deletes a leave after a closed period", async () => {
    const op = await newOperator("Leave Op", "30000", new Date(2026, 3, 1));
    await db.$transaction((tx) => ensureInitialPeriod(tx, op));
    const periodId = (await db.operatorWorkingPeriod.findFirstOrThrow({ where: { operatorId: op.id } })).id;
    await patchPeriod(
      req("PATCH", `/api/operators/${op.id}/periods/${periodId}`, { body: { close: true, endDate: "2026-04-30" } }),
      ctx({ id: op.id, periodId }),
    );
    const created = await postLeave(
      req("POST", `/api/operators/${op.id}/leaves`, { body: { startDate: "2026-05-01", endDate: "2026-05-10", type: "PAID", reason: "Wedding" } }),
      ctx(ids(op.id)),
    );
    expect(created.status).toBe(201);
    const { leave } = await jsonOf<{ leave: { id: string } }>(created);
    expect((await jsonOf<{ leaves: unknown[] }>(await getLeaves(req("GET", `/api/operators/${op.id}/leaves`), ctx(ids(op.id))))).leaves).toHaveLength(1);
    const del = await deleteLeaveRoute(
      req("DELETE", `/api/operators/${op.id}/leaves/${leave.id}`),
      ctx({ id: op.id, leaveId: leave.id }),
    );
    expect(del.status).toBe(200);
    expect(await db.operatorLeave.count({ where: { operatorId: op.id } })).toBe(0);
    // a leave before any closed period is refused
    const early = await createLeave(t.businessId, t.actor, op.id, { startDate: "2026-02-01", endDate: "2026-02-03" });
    expect("error" in early).toBe(true);
  });
});

describe("tenant isolation", () => {
  it("another business gets 404 for every period/leave route, and nothing changes", async () => {
    const op = await scenarioBeforeSession2();
    await start(op.id, startBody({ carryForward: false }));
    const ov = (await getOperatorPeriodsOverview(t.businessId, op.id, NOW))!;
    const periodId = ov.periods[1]!.id;
    const leaveId = ov.leaves[0]!.id;
    const before = await db.operatorWorkingPeriod.findUniqueOrThrow({ where: { id: periodId } });

    actAs(other);
    const results = await Promise.all([
      getPeriods(req("GET", `/api/operators/${op.id}/periods`), ctx(ids(op.id))),
      postPeriod(req("POST", `/api/operators/${op.id}/periods`, { body: startBody({ startDate: "2026-12-01", previousEndDate: undefined }) }), ctx(ids(op.id))),
      getPeriod(req("GET", `/api/operators/${op.id}/periods/${periodId}`), ctx({ id: op.id, periodId })),
      patchPeriod(req("PATCH", `/api/operators/${op.id}/periods/${periodId}`, { body: { notes: "x" } }), ctx({ id: op.id, periodId })),
      getLeaves(req("GET", `/api/operators/${op.id}/leaves`), ctx(ids(op.id))),
      postLeave(req("POST", `/api/operators/${op.id}/leaves`, { body: { startDate: "2026-12-01", endDate: "2026-12-02" } }), ctx(ids(op.id))),
      deleteLeaveRoute(req("DELETE", `/api/operators/${op.id}/leaves/${leaveId}`), ctx({ id: op.id, leaveId })),
    ]);
    for (const res of results) {
      expect(res.status).toBe(404);
      expect((await jsonOf<ErrorBody>(res)).code).toBe("NOT_FOUND");
    }
    actAs(t);
    const after = await db.operatorWorkingPeriod.findUniqueOrThrow({ where: { id: periodId } });
    expect(after.version).toBe(before.version);
    expect(await db.operatorLeave.count({ where: { id: leaveId } })).toBe(1);
    expect(await db.operatorWorkingPeriod.count({ where: { operatorId: op.id } })).toBe(2);

    // A period id of another operator under this operator's URL is also "not found".
    const op2 = await newOperator("Someone Else");
    const wrong = await getPeriod(req("GET", `/api/operators/${op2.id}/periods/${periodId}`), ctx({ id: op2.id, periodId }));
    expect(wrong.status).toBe(404);
    const wrongPatch = await patchPeriod(
      req("PATCH", `/api/operators/${op2.id}/periods/${periodId}`, { body: { notes: "x" } }),
      ctx({ id: op2.id, periodId }),
    );
    expect(wrongPatch.status).toBe(404);
  });
});

describe("Clear Data keeps the salary history", () => {
  it("keeps operators, transactions, working periods and leaves", async () => {
    const own = await createTenant("periods-clear");
    try {
      const op = await db.operator.create({
        data: { businessId: own.businessId, name: "Clear Me", mobile: "9555555555", defaultMonthlySalary: "30000", joiningDate: JOIN },
      });
      const started = await startWorkingPeriod(own.businessId, own.actor, op.id, {
        startDate: "2026-09-14",
        previousEndDate: "2026-08-26",
        carryForward: false,
      });
      expect("error" in started).toBe(false);
      expect(await db.operatorWorkingPeriod.count({ where: { businessId: own.businessId } })).toBe(2);
      const result = await clearBusinessData(own.businessCode, { supportSessionId: "clear-test", reason: "periods" });
      expect("counts" in result).toBe(true);
      expect(await db.operatorWorkingPeriod.count({ where: { businessId: own.businessId } })).toBe(2);
      expect(await db.operatorLeave.count({ where: { businessId: own.businessId } })).toBe(1);
      expect(await db.operator.count({ where: { businessId: own.businessId } })).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanupTenant(own.businessId);
    }
  });
});
