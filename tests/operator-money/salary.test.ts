import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  computeSalaryForMonth,
  getLifetimeSalaryBreakdown,
  getLifetimeSalarySummary,
  getSalaryBreakdownForMonth,
  getTotalSalaryDue,
} from "@/lib/services/salary";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";

/**
 * Salary math is exact (Decimal / NUMERIC): fractional paise must add up to the
 * paisa, and the carry-forward rule must behave exactly as before. All dates
 * here are built with LOCAL-time constructors (the service buckets by local
 * calendar month), so the suite is timezone independent.
 */

let t: TestTenant;

// A fresh operator per scenario keeps the cases independent of each other.
async function newOperator(opts: { salary: string; joiningDate: Date }) {
  return db.operator.create({
    data: {
      businessId: t.businessId,
      name: "Salary Case",
      mobile: "9333333333",
      defaultMonthlySalary: opts.salary,
      joiningDate: opts.joiningDate,
    },
  });
}

type Effect = "ADVANCE_RECOVERABLE" | "BUSINESS_EXPENSE" | "SALARY_PAYMENT" | "BONUS_INCENTIVE" | "OTHER";
async function addTx(
  businessId: string,
  operatorId: string,
  date: Date,
  amount: string,
  effect: Effect,
  deductFromSalary = true,
) {
  return db.operatorTransaction.create({
    data: { businessId, operatorId, date, amount, businessEffect: effect, deductFromSalary },
  });
}

beforeAll(async () => {
  t = await createTenant("salary");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("computeSalaryForMonth - exact paise arithmetic", () => {
  it("adds 0.1 + 0.2 style amounts exactly (bonus, deductions, paid)", async () => {
    const op = await newOperator({ salary: "1000.10", joiningDate: new Date(2026, 5, 1) });
    await addTx(t.businessId, op.id, new Date(2026, 5, 10, 12), "0.10", "BONUS_INCENTIVE");
    await addTx(t.businessId, op.id, new Date(2026, 5, 11, 12), "0.20", "BONUS_INCENTIVE");
    await addTx(t.businessId, op.id, new Date(2026, 5, 12, 12), "0.10", "ADVANCE_RECOVERABLE");
    await addTx(t.businessId, op.id, new Date(2026, 5, 13, 12), "0.20", "BUSINESS_EXPENSE");
    // Not deducted: must not count anywhere.
    await addTx(t.businessId, op.id, new Date(2026, 5, 14, 12), "500.00", "ADVANCE_RECOVERABLE", false);
    await addTx(t.businessId, op.id, new Date(2026, 5, 15, 12), "100.05", "SALARY_PAYMENT", false);

    const salary = await computeSalaryForMonth(t.businessId, op.id, 2026, 5);
    expect(salary.baseSalary).toBe(1000.1);
    expect(salary.bonus).toBe(0.3); // 0.1 + 0.2, not 0.30000000000000004
    expect(salary.deductions).toBe(0.3);
    expect(salary.alreadyPaid).toBe(100.05);
    expect(salary.carriedForward).toBe(0);
    expect(salary.payable).toBe(900.05); // 1000.10 + 0.30 - 0.30 - 100.05
    expect(salary.transactions).toHaveLength(6);
  });

  it("a SALARY_PAYMENT counts as paid even when deductFromSalary is true, and is never also a deduction", async () => {
    const op = await newOperator({ salary: "5000.00", joiningDate: new Date(2026, 5, 1) });
    await addTx(t.businessId, op.id, new Date(2026, 5, 20, 12), "1234.56", "SALARY_PAYMENT", true);

    const salary = await computeSalaryForMonth(t.businessId, op.id, 2026, 5);
    expect(salary.alreadyPaid).toBe(1234.56);
    expect(salary.deductions).toBe(0);
    expect(salary.payable).toBe(3765.44);
  });

  it("carry-forward: unpaid and overpaid earlier months roll into later ones (unchanged rule)", async () => {
    const op = await newOperator({ salary: "1000.10", joiningDate: new Date(2026, 5, 1) });
    await addTx(t.businessId, op.id, new Date(2026, 5, 10, 12), "0.10", "BONUS_INCENTIVE");
    await addTx(t.businessId, op.id, new Date(2026, 5, 11, 12), "0.20", "BONUS_INCENTIVE");
    await addTx(t.businessId, op.id, new Date(2026, 5, 12, 12), "0.30", "ADVANCE_RECOVERABLE");
    await addTx(t.businessId, op.id, new Date(2026, 5, 15, 12), "100.05", "SALARY_PAYMENT");
    // July: nothing but a big overpayment.
    await addTx(t.businessId, op.id, new Date(2026, 6, 5, 12), "2500.25", "SALARY_PAYMENT");

    const june = await computeSalaryForMonth(t.businessId, op.id, 2026, 5);
    expect(june.carriedForward).toBe(0);
    expect(june.payable).toBe(900.05);

    const july = await computeSalaryForMonth(t.businessId, op.id, 2026, 6);
    expect(july.carriedForward).toBe(900.05);
    expect(july.payable).toBe(-600.1); // 1000.10 + 900.05 - 2500.25 (overpaid)

    // August: an empty month still owes the full base on top of the carried balance.
    const august = await computeSalaryForMonth(t.businessId, op.id, 2026, 7);
    expect(august.carriedForward).toBe(-600.1);
    expect(august.bonus).toBe(0);
    expect(august.payable).toBe(400); // 1000.10 - 600.10
  });

  it("a month before joining carries nothing forward", async () => {
    const op = await newOperator({ salary: "2000.00", joiningDate: new Date(2026, 8, 1) });
    const earlier = await computeSalaryForMonth(t.businessId, op.id, 2026, 5);
    expect(earlier.carriedForward).toBe(0);
    expect(earlier.payable).toBe(2000);
  });

  it("matches an independent integer-paise reference over a randomised history", async () => {
    // Deterministic PRNG so a failure is reproducible.
    let seed = 0x2f6e2b1;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };

    const basePaise = 234_567; // 2345.67
    const op = await newOperator({ salary: "2345.67", joiningDate: new Date(2026, 0, 1) });

    type Row = { month: number; effect: Effect; deduct: boolean; paise: number };
    const rows: Row[] = [];
    const effects: Effect[] = ["ADVANCE_RECOVERABLE", "BUSINESS_EXPENSE", "SALARY_PAYMENT", "BONUS_INCENTIVE", "OTHER"];
    for (let i = 0; i < 150; i++) {
      rows.push({
        month: Math.floor(rand() * 6), // Jan..Jun 2026
        effect: effects[Math.floor(rand() * effects.length)]!,
        deduct: rand() < 0.7,
        paise: 1 + Math.floor(rand() * 99_999), // 0.01 .. 999.99
      });
    }
    await db.operatorTransaction.createMany({
      data: rows.map((r, i) => ({
        businessId: t.businessId,
        operatorId: op.id,
        date: new Date(2026, r.month, 1 + (i % 28), 12),
        amount: (r.paise / 100).toFixed(2),
        businessEffect: r.effect,
        deductFromSalary: r.deduct,
      })),
    });

    const totalsFor = (month: number) => {
      let bonus = 0;
      let deductions = 0;
      let paid = 0;
      for (const r of rows.filter((x) => x.month === month)) {
        if (r.effect === "SALARY_PAYMENT") paid += r.paise;
        else if (r.effect === "BONUS_INCENTIVE") bonus += r.paise;
        else if (r.deduct) deductions += r.paise;
      }
      return { bonus, deductions, paid };
    };

    for (let month = 0; month < 6; month++) {
      let carried = 0;
      for (let m = 0; m < month; m++) {
        const x = totalsFor(m);
        carried += basePaise + x.bonus - x.deductions - x.paid;
      }
      const cur = totalsFor(month);
      const expectedPayable = basePaise + cur.bonus - cur.deductions - cur.paid + carried;

      const salary = await computeSalaryForMonth(t.businessId, op.id, 2026, month);
      expect(salary.bonus).toBe(cur.bonus / 100);
      expect(salary.deductions).toBe(cur.deductions / 100);
      expect(salary.alreadyPaid).toBe(cur.paid / 100);
      expect(salary.carriedForward).toBe(carried / 100);
      expect(salary.payable).toBe(expectedPayable / 100);
    }
  });

  it("never reads another tenant's operator", async () => {
    const other = await createTenant("salary-other");
    try {
      await expect(computeSalaryForMonth(t.businessId, other.operatorId, 2026, 5)).rejects.toThrow();
      await expect(getLifetimeSalarySummary(t.businessId, other.operatorId)).rejects.toThrow();
    } finally {
      await cleanupTenant(other.businessId);
    }
  });
});

describe("lifetime summary and business-wide figures", () => {
  // Joined 7 Jun 2026, "today" = 15 Aug 2026: two full cycles (7 Jun to 7 Jul to 7 Aug)
  // plus 8 days into the 31-day 7 Aug to 7 Sep cycle.
  it("accrues day by day with a single final rounding", async () => {
    const op = await newOperator({ salary: "1000.10", joiningDate: new Date(2026, 5, 7) });
    await addTx(t.businessId, op.id, new Date(2026, 5, 10, 12), "10.50", "BONUS_INCENTIVE");
    await addTx(t.businessId, op.id, new Date(2026, 5, 11, 12), "3.25", "ADVANCE_RECOVERABLE");
    await addTx(t.businessId, op.id, new Date(2026, 6, 2, 12), "500.00", "SALARY_PAYMENT");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 15, 12));

    const summary = await getLifetimeSalarySummary(t.businessId, op.id);
    expect(summary.baseSalary).toBe(1000.1);
    expect(summary.accrual.fullCycles).toBe(2);
    expect(summary.accrual.fullCyclesAmount).toBe(2000.2);
    expect(summary.accrual.cycleDays).toBe(31);
    expect(summary.accrual.elapsedDays).toBe(8);
    expect(summary.accrual.dailyRate).toBe(32.26); // 1000.10 / 31
    // 1000.10 x 8 / 31 = 258.0903... - computed from the exact quotient, not 32.26 x 8.
    expect(summary.accrual.partialAmount).toBe(258.09);
    expect(summary.bonus).toBe(10.5);
    expect(summary.deductions).toBe(3.25);
    // 2000.20 + 258.0903... + 10.50 - 3.25 = 2265.5403... -> 2265.54
    expect(summary.totalPayable).toBe(2265.54);
    expect(summary.totalPaid).toBe(500);
    expect(summary.remaining).toBe(1765.54);

    const breakdown = await getLifetimeSalaryBreakdown(t.businessId);
    expect(breakdown.find((b) => b.operatorId === op.id)?.remaining).toBe(1765.54);
  });

  it("current-month breakdown and total due include the carried-forward balance", async () => {
    // Own tenant so the "total due" sum covers exactly this operator.
    const own = await createTenant("salary-due");
    try {
      await db.operator.update({
        where: { id: own.operatorId },
        data: { defaultMonthlySalary: "1000.10", joiningDate: new Date(2026, 5, 7) },
      });
      await addTx(own.businessId, own.operatorId, new Date(2026, 5, 10, 12), "10.50", "BONUS_INCENTIVE");
      await addTx(own.businessId, own.operatorId, new Date(2026, 5, 11, 12), "3.25", "ADVANCE_RECOVERABLE");
      await addTx(own.businessId, own.operatorId, new Date(2026, 5, 12, 12), "500.00", "SALARY_PAYMENT");

      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 7, 15, 12));

      // June 507.35 (1000.10 + 10.50 - 3.25 - 500) + July 1000.10 carried into August.
      const aug = await getSalaryBreakdownForMonth(own.businessId, 2026, 7);
      expect(aug).toEqual([{ operatorId: own.operatorId, baseSalary: 1000.1, bonus: 0, payable: 2507.55 }]);
      expect(await getTotalSalaryDue(own.businessId)).toBe(2507.55);

      const june = await getSalaryBreakdownForMonth(own.businessId, 2026, 5);
      expect(june[0]).toEqual({ operatorId: own.operatorId, baseSalary: 1000.1, bonus: 10.5, payable: 507.35 });
    } finally {
      vi.useRealTimers();
      await cleanupTenant(own.businessId);
    }
  });

  it("an overpaid operator does not reduce the total due (only positive payables are summed)", async () => {
    const own = await createTenant("salary-neg");
    try {
      await db.operator.update({
        where: { id: own.operatorId },
        data: { defaultMonthlySalary: "100.00", joiningDate: new Date(2026, 7, 1) },
      });
      await addTx(own.businessId, own.operatorId, new Date(2026, 7, 3, 12), "250.00", "SALARY_PAYMENT", false);
      const owed = await db.operator.create({
        data: {
          businessId: own.businessId,
          name: "Owed",
          mobile: "9444444444",
          defaultMonthlySalary: "75.55",
          joiningDate: new Date(2026, 7, 1),
        },
      });

      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 7, 15, 12));

      const rows = await getSalaryBreakdownForMonth(own.businessId, 2026, 7);
      expect(rows.find((r) => r.operatorId === own.operatorId)?.payable).toBe(-150);
      expect(rows.find((r) => r.operatorId === owed.id)?.payable).toBe(75.55);
      expect(await getTotalSalaryDue(own.businessId)).toBe(75.55);
    } finally {
      vi.useRealTimers();
      await cleanupTenant(own.businessId);
    }
  });
});
