import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { computeServiceStatus } from "@/lib/services/serviceStatus";
import { getSalaryBreakdownForMonth, getTotalSalaryDue } from "@/lib/services/salary";
import { currentMonthRange } from "@/lib/utils/dates";

const TREND_MONTHS = 6;

/** Registration number is optional — omit the parenthetical entirely
 * rather than printing "(null)" in an alert message. */
function machineLabel(name: string, machineNumber: string | null) {
  return machineNumber ? `${name} (${machineNumber})` : name;
}

const COMPONENT_ALERT_LEAD_HOURS = 15;
const COMPONENT_ALERTS_LIMIT = 8;

/**
 * Per-component predictive maintenance check — cross-references each
 * machine's live hour meter against every catalog component that has a
 * configured interval (see GUIDE_INTERVAL_HOURS in serviceRecords.ts,
 * sourced from the general excavator maintenance interval guide), using
 * whichever service record last actually serviced that specific component
 * (falling back to the machine's starting hour meter if it never has been).
 * Surfaces a warning starting COMPONENT_ALERT_LEAD_HOURS before the
 * projected due hour, and a danger once past it — this is what feeds "tell
 * admin ahead of time this part needs checking" into the alert feed. Always
 * computed live off current data rather than on a fixed schedule, so it's
 * automatically fresh whenever the admin actually looks (dashboard load,
 * machine going idle, evening check-in — all just page views of the same
 * live numbers).
 *
 * A component with no service history at all projects forward from the
 * machine's *current* hour meter, not its starting one — servicing this
 * granular wasn't necessarily tracked in the app before today, so assuming
 * it was neglected since hour 0 would flood a machine with years of
 * untracked history in false "overdue" alerts the moment this feature
 * ships. Once a real service is logged for a component, its actual hour
 * meter takes over and drives the real projection from then on.
 */
async function getComponentMaintenanceAlerts(businessId: string) {
  const [excavators, catalog, serviceRecordItems] = await Promise.all([
    db.excavator.findMany({
      where: { businessId, isArchived: false },
      select: { id: true, name: true, machineNumber: true, currentHourMeter: true },
    }),
    db.serviceItem.findMany({
      where: { businessId, defaultIntervalHours: { not: null } },
      select: { id: true, name: true, defaultIntervalHours: true },
    }),
    db.serviceRecordItem.findMany({
      where: { done: true, serviceRecord: { businessId } },
      select: {
        serviceItemId: true,
        serviceRecord: { select: { excavatorId: true, hourMeterAtService: true, serviceDate: true } },
      },
      orderBy: { serviceRecord: { serviceDate: "desc" } },
    }),
  ]);

  if (excavators.length === 0 || catalog.length === 0) return [];

  // Most recent (first seen, since sorted desc) hour meter this exact
  // component was actually serviced at, per machine.
  const lastServicedHour = new Map<string, number>();
  for (const sri of serviceRecordItems) {
    const key = `${sri.serviceRecord.excavatorId}:${sri.serviceItemId}`;
    if (!lastServicedHour.has(key)) lastServicedHour.set(key, sri.serviceRecord.hourMeterAtService);
  }

  const due: { level: "warning" | "danger"; message: string; href: string; dueInHours: number }[] = [];
  for (const excavator of excavators) {
    for (const item of catalog) {
      if (item.defaultIntervalHours == null) continue;
      const lastHour = lastServicedHour.get(`${excavator.id}:${item.id}`) ?? excavator.currentHourMeter;
      const dueAtHour = lastHour + item.defaultIntervalHours;
      const dueInHours = Math.round((dueAtHour - excavator.currentHourMeter) * 100) / 100;
      if (dueInHours > COMPONENT_ALERT_LEAD_HOURS) continue;

      const label = machineLabel(excavator.name, excavator.machineNumber);
      due.push({
        level: dueInHours < 0 ? "danger" : "warning",
        message:
          dueInHours < 0
            ? `${item.name} on ${label} is overdue for service/inspection by ${Math.abs(dueInHours)} hrs`
            : `${item.name} on ${label} needs service/inspection soon — due in ${dueInHours} hrs`,
        href: `/excavators/detail?id=${excavator.id}&tab=service`,
        dueInHours,
      });
    }
  }

  return due
    .sort((a, b) => a.dueInHours - b.dueInHours)
    .slice(0, COMPONENT_ALERTS_LIMIT)
    .map(({ level, message, href }) => ({ level, message, href }));
}

/** Full alert list for the header bell dropdown — same shape as
 * getDashboardSummary's alerts, but computed standalone (no revenue/payment
 * aggregates) since every page renders the bell, not just the dashboard.
 * Idle-machine notices are deliberately excluded — those live on the
 * machine's own detail page instead, not in the global feed. */
async function getAlertsUncached(businessId: string) {
  const [business, excavators, pendingLogsCount, pendingWorkRequestsCount, activeWorkRequests, componentAlerts] =
    await Promise.all([
      db.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { defaultServiceIntervalHrs: true, maintenanceAlertThresholdHrs: true },
      }),
      db.excavator.findMany({
        where: { businessId, isArchived: false },
        select: {
          id: true,
          name: true,
          machineNumber: true,
          currentHourMeter: true,
          startingHourMeter: true,
          serviceIntervalHrs: true,
          serviceRecords: { orderBy: { serviceDate: "desc" }, take: 1, select: { hourMeterAtService: true, nextServiceDueHour: true } },
        },
      }),
      db.dailyWorkLog.count({ where: { status: "PENDING", workSession: { businessId } } }),
      db.operatorWorkRequest.count({ where: { status: "PENDING", businessId } }),
      db.operatorWorkRequest.findMany({
        where: { status: "ACTIVE", businessId },
        select: {
          excavatorId: true,
          excavator: { select: { name: true, machineNumber: true } },
          operator: { select: { name: true } },
          startHourMeter: true,
        },
      }),
      // Run alongside the rest instead of after — it doesn't depend on any
      // of these results, so there's no reason to pay for it as a second
      // sequential round-trip.
      getComponentMaintenanceAlerts(businessId),
    ]);

  const alerts: { level: "warning" | "danger"; message: string; href: string }[] = [];
  if (pendingLogsCount > 0) {
    alerts.push({
      level: "warning",
      message: `${pendingLogsCount} operator reading${pendingLogsCount === 1 ? "" : "s"} waiting for approval`,
      href: "/operators/approvals",
    });
  }
  if (pendingWorkRequestsCount > 0) {
    alerts.push({
      level: "warning",
      message: `${pendingWorkRequestsCount} operator-reported job${pendingWorkRequestsCount === 1 ? "" : "s"} waiting for approval`,
      href: "/operators/approvals",
    });
  }
  for (const req of activeWorkRequests) {
    alerts.push({
      level: "warning",
      message: `${machineLabel(req.excavator.name, req.excavator.machineNumber)} started by ${req.operator.name} at ${req.startHourMeter} hrs`,
      href: `/excavators/detail?id=${req.excavatorId}`,
    });
  }
  for (const excavator of excavators) {
    const lastService = excavator.serviceRecords[0] ?? null;
    const serviceStatus = computeServiceStatus({
      currentHourMeter: excavator.currentHourMeter,
      startingHourMeter: excavator.startingHourMeter,
      serviceIntervalHrs: excavator.serviceIntervalHrs,
      businessDefaultIntervalHrs: business.defaultServiceIntervalHrs,
      lastServiceHourMeter: lastService?.hourMeterAtService,
      lastServiceNextDueHour: lastService?.nextServiceDueHour,
      dueSoonThresholdHrs: business.maintenanceAlertThresholdHrs,
    });
    const href = `/excavators/detail?id=${excavator.id}`;
    if (serviceStatus.overdue) {
      alerts.push({
        level: "danger",
        message: `${machineLabel(excavator.name, excavator.machineNumber)} service is overdue by ${Math.abs(serviceStatus.dueInHours)} hrs`,
        href,
      });
    } else if (serviceStatus.dueSoon) {
      alerts.push({
        level: "warning",
        message: `${machineLabel(excavator.name, excavator.machineNumber)} service due in ${serviceStatus.dueInHours} hrs`,
        href,
      });
    }
  }

  alerts.push(...componentAlerts);

  return alerts;
}

/**
 * Cached across requests (not just within one, unlike the React cache()
 * calls elsewhere) — this runs on every single page via (app)/layout.tsx,
 * so an uncached version means clicking between pages re-runs this whole
 * batch on every click even though the underlying alerts rarely change
 * second-to-second. 15s is short enough that a new pending approval or
 * overdue-service alert shows up within one page load either way, but long
 * enough that navigating around the app for a bit doesn't re-hit the
 * database for the same data repeatedly.
 */
export const getAlerts = unstable_cache(getAlertsUncached, ["dashboard-alerts"], { revalidate: 15 });

/** Backs the "Hours This Month" card's View Detail dialog — per-machine
 * breakdown of hours worked and which attachment(s) were reported in use,
 * for whichever WorkSessions overlap the current month. */
export async function getMachineHoursDetail(businessId: string) {
  const { start, end } = currentMonthRange();
  const excavators = await db.excavator.findMany({
    where: { businessId, isArchived: false },
    select: {
      id: true,
      name: true,
      machineNumber: true,
      workSessions: {
        where: {
          status: "COMPLETED",
          OR: [{ startDate: { gte: start, lte: end } }, { endDate: { gte: start, lte: end } }],
        },
        select: { totalHours: true, attachment: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return excavators.map((e) => {
    const byAttachment = new Map<string, number>();
    for (const s of e.workSessions) {
      const key = s.attachment?.trim() || "No attachment reported";
      byAttachment.set(key, (byAttachment.get(key) ?? 0) + s.totalHours);
    }
    return {
      id: e.id,
      name: e.name,
      machineNumber: e.machineNumber,
      hours: Math.round(e.workSessions.reduce((sum, s) => sum + s.totalHours, 0) * 100) / 100,
      // Hours broken down by whichever attachment(s) were actually reported
      // in use — a machine that only ever ran one attachment this month
      // (e.g. always "Chain") naturally ends up with a single-row
      // breakdown, not a forced Bucket/Breaker split.
      breakdown: [...byAttachment.entries()]
        .map(([attachment, hours]) => ({ attachment, hours: Math.round(hours * 100) / 100 }))
        .sort((a, b) => b.hours - a.hours),
    };
  });
}

function getTrendMonths() {
  const now = new Date();
  return Array.from({ length: TREND_MONTHS }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (TREND_MONTHS - 1 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString("en-IN", { month: "short" }) };
  });
}

export async function getMonthlyHoursTrend(businessId: string) {
  const months = getTrendMonths();
  const rangeStart = new Date(months[0].year, months[0].month, 1);
  const logs = await db.dailyWorkLog.findMany({
    where: { workSession: { businessId }, date: { gte: rangeStart } },
    select: { date: true, hoursWorked: true },
  });

  return months.map(({ year, month, label }) => {
    const hours = logs
      .filter((log) => log.date.getFullYear() === year && log.date.getMonth() === month)
      .reduce((sum, log) => sum + log.hoursWorked, 0);
    return { month: label, hours: Math.round(hours * 100) / 100 };
  });
}

export async function getMonthlyRevenueTrend(businessId: string) {
  const months = getTrendMonths();
  const rangeStart = new Date(months[0].year, months[0].month, 1);
  const bills = await db.bill.findMany({
    where: { businessId, billDate: { gte: rangeStart } },
    select: { billDate: true, totalAmount: true },
  });

  return months.map(({ year, month, label }) => {
    const revenue = bills
      .filter((b) => b.billDate.getFullYear() === year && b.billDate.getMonth() === month)
      .reduce((sum, b) => sum + b.totalAmount, 0);
    return { month: label, revenue: Math.round(revenue * 100) / 100 };
  });
}

/**
 * Sessions with daily logs are counted from those logs (bounded to the
 * range). Sessions billed straight off the start/end hour meter — no daily
 * log ever entered — have no per-day breakdown to bound, so their full
 * totalHours counts whenever the session itself overlaps the range. Either
 * path contributes each session's hours exactly once.
 */
async function getHoursForSessionsOverlappingRange(businessId: string, start: Date, end: Date) {
  const [loggedAgg, sessionsWithoutLogs] = await Promise.all([
    db.dailyWorkLog.aggregate({
      where: { workSession: { businessId }, date: { gte: start, lte: end } },
      _sum: { hoursWorked: true },
    }),
    db.workSession.findMany({
      where: {
        businessId,
        dailyLogs: { none: {} },
        OR: [{ startDate: { gte: start, lte: end } }, { endDate: { gte: start, lte: end } }],
      },
      select: { totalHours: true },
    }),
  ]);

  const loggedHours = loggedAgg._sum.hoursWorked ?? 0;
  const directHours = sessionsWithoutLogs.reduce((sum, s) => sum + s.totalHours, 0);
  return Math.round((loggedHours + directHours) * 100) / 100;
}

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null; // nothing to meaningfully compare against
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

async function getDashboardSummaryUncached(businessId: string) {
  const { start, end } = currentMonthRange();
  const lastMonthEnd = new Date(start.getTime() - 1);
  const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);

  const [
    business,
    excavators,
    hoursThisMonth,
    hoursLastMonth,
    revenueAgg,
    revenueLastMonthAgg,
    receivedAgg,
    pendingBills,
    totalCustomers,
    allTimeAgg,
    pendingLogsCount,
    pendingWorkRequestsCount,
    activeWorkRequests,
    operatorSalaryDue,
    componentAlerts,
  ] = await Promise.all([
    db.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { defaultServiceIntervalHrs: true, maintenanceAlertThresholdHrs: true, ownerName: true },
    }),
    db.excavator.findMany({
      where: { businessId, isArchived: false },
      include: {
        serviceRecords: { orderBy: { serviceDate: "desc" }, take: 1 },
      },
    }),
    // Sums the actual work-session hours (not just DailyWorkLog rows) so a
    // session billed straight off the start/end hour meter — with no daily
    // log ever entered — still counts, instead of silently reading as 0.
    getHoursForSessionsOverlappingRange(businessId, start, end),
    getHoursForSessionsOverlappingRange(businessId, lastMonthStart, lastMonthEnd),
    db.bill.aggregate({
      where: { businessId, billDate: { gte: start, lte: end } },
      _sum: { totalAmount: true },
    }),
    db.bill.aggregate({
      where: { businessId, billDate: { gte: lastMonthStart, lte: lastMonthEnd } },
      _sum: { totalAmount: true },
    }),
    db.payment.aggregate({
      where: { businessId },
      _sum: { amount: true },
    }),
    db.bill.findMany({
      where: { businessId, status: { in: ["UNPAID", "PARTIAL"] } },
      select: { totalAmount: true, paidAmount: true },
    }),
    db.customer.count({ where: { businessId, isArchived: false } }),
    db.bill.aggregate({ where: { businessId }, _sum: { totalAmount: true }, _count: true }),
    db.dailyWorkLog.count({ where: { status: "PENDING", workSession: { businessId } } }),
    db.operatorWorkRequest.count({ where: { status: "PENDING", businessId } }),
    db.operatorWorkRequest.findMany({
      where: { status: "ACTIVE", businessId },
      select: {
        excavatorId: true,
        excavator: { select: { name: true, machineNumber: true } },
        operator: { select: { name: true } },
        startHourMeter: true,
      },
    }),
    getTotalSalaryDue(businessId),
    // Run alongside the rest instead of after — see the same change in
    // getAlerts above for why.
    getComponentMaintenanceAlerts(businessId),
  ]);

  const revenueThisMonth = Math.round((revenueAgg._sum.totalAmount ?? 0) * 100) / 100;
  const revenueLastMonth = Math.round((revenueLastMonthAgg._sum.totalAmount ?? 0) * 100) / 100;
  const amountReceived = Math.round((receivedAgg._sum.amount ?? 0) * 100) / 100;
  const pendingPayments =
    Math.round(pendingBills.reduce((sum, b) => sum + (b.totalAmount - b.paidAmount), 0) * 100) / 100;
  const revenueTrendPct = percentChange(revenueThisMonth, revenueLastMonth);
  const hoursTrendPct = percentChange(hoursThisMonth, hoursLastMonth);

  const excavatorsWithStatus = excavators.map((excavator) => {
    const lastService = excavator.serviceRecords[0] ?? null;
    const serviceStatus = computeServiceStatus({
      currentHourMeter: excavator.currentHourMeter,
      startingHourMeter: excavator.startingHourMeter,
      serviceIntervalHrs: excavator.serviceIntervalHrs,
      businessDefaultIntervalHrs: business.defaultServiceIntervalHrs,
      lastServiceHourMeter: lastService?.hourMeterAtService,
      lastServiceNextDueHour: lastService?.nextServiceDueHour,
      dueSoonThresholdHrs: business.maintenanceAlertThresholdHrs,
    });

    return { excavator, serviceStatus };
  });

  const cards = {
    totalExcavators: excavators.length,
    working: excavators.filter((e) => e.status === "WORKING").length,
    idle: excavators.filter((e) => e.status === "IDLE").length,
    underService: excavators.filter((e) => e.status === "SERVICE").length,
    hoursThisMonth,
    hoursTrendPct,
    revenueThisMonth,
    revenueTrendPct,
    amountReceived,
    pendingPayments,
    pendingBillsCount: pendingBills.length,
    totalCustomers,
    totalRevenueAllTime: Math.round((allTimeAgg._sum.totalAmount ?? 0) * 100) / 100,
    totalBillsCount: allTimeAgg._count,
    upcomingServices: excavatorsWithStatus.filter((e) => e.serviceStatus.dueSoon).length,
    operatorSalaryDue,
    pendingApprovalsCount: pendingLogsCount + pendingWorkRequestsCount,
  };

  const alerts: { level: "warning" | "danger"; message: string; href: string }[] = [];
  if (pendingLogsCount > 0) {
    alerts.push({
      level: "warning",
      message: `${pendingLogsCount} operator reading${pendingLogsCount === 1 ? "" : "s"} waiting for approval`,
      href: "/operators/approvals",
    });
  }
  if (pendingWorkRequestsCount > 0) {
    alerts.push({
      level: "warning",
      message: `${pendingWorkRequestsCount} operator-reported job${pendingWorkRequestsCount === 1 ? "" : "s"} waiting for approval`,
      href: "/operators/approvals",
    });
  }
  for (const req of activeWorkRequests) {
    alerts.push({
      level: "warning",
      message: `${machineLabel(req.excavator.name, req.excavator.machineNumber)} started by ${req.operator.name} at ${req.startHourMeter} hrs`,
      href: `/excavators/detail?id=${req.excavatorId}`,
    });
  }
  for (const { excavator, serviceStatus } of excavatorsWithStatus) {
    const href = `/excavators/detail?id=${excavator.id}`;
    if (serviceStatus.overdue) {
      alerts.push({
        level: "danger",
        message: `${machineLabel(excavator.name, excavator.machineNumber)} service is overdue by ${Math.abs(serviceStatus.dueInHours)} hrs`,
        href,
      });
    } else if (serviceStatus.dueSoon) {
      alerts.push({
        level: "warning",
        message: `${machineLabel(excavator.name, excavator.machineNumber)} service due in ${serviceStatus.dueInHours} hrs`,
        href,
      });
    }
  }

  alerts.push(...componentAlerts);

  return { cards, alerts, ownerName: business.ownerName };
}

/** Cached the same way and for the same reason as getAlerts above — this is
 * the single largest query batch in the app (15 queries), and it backs the
 * page you land back on most often. */
export const getDashboardSummary = unstable_cache(getDashboardSummaryUncached, ["dashboard-summary"], {
  revalidate: 15,
});


export type ActivityEvent = {
  id: string;
  kind: "work-started" | "work-stopped" | "bill" | "payment";
  message: string;
  detail: string;
  at: Date;
};

/** A merged, most-recent-first feed built from real rows across WorkSession,
 * Bill and Payment — no fabricated clock-time events, just what's genuinely
 * on record (dated to the day; exact time-of-day isn't tracked). */
export async function getRecentActivity(businessId: string, limit = 8): Promise<ActivityEvent[]> {
  const [started, stopped, bills, payments] = await Promise.all([
    db.workSession.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        startDate: true,
        excavator: { select: { name: true } },
        site: { select: { name: true } },
        customer: { select: { name: true } },
      },
    }),
    db.workSession.findMany({
      where: { businessId, status: "COMPLETED" },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { id: true, updatedAt: true, totalHours: true, excavator: { select: { name: true } }, customer: { select: { name: true } } },
    }),
    db.bill.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, createdAt: true, billNumber: true, totalAmount: true, customer: { select: { name: true } } },
    }),
    db.payment.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, createdAt: true, amount: true, bill: { select: { billNumber: true, customer: { select: { name: true } } } } },
    }),
  ]);

  const events: ActivityEvent[] = [
    ...started.map((s) => ({
      id: `start-${s.id}`,
      kind: "work-started" as const,
      message: `${s.excavator.name} started work for ${s.customer.name}`,
      detail: s.site.name,
      at: s.createdAt,
    })),
    ...stopped.map((s) => ({
      id: `stop-${s.id}`,
      kind: "work-stopped" as const,
      message: `${s.excavator.name} finished a job for ${s.customer.name}`,
      detail: `${s.totalHours} hrs total`,
      at: s.updatedAt,
    })),
    ...bills.map((b) => ({
      id: `bill-${b.id}`,
      kind: "bill" as const,
      message: `Bill ${b.billNumber} generated for ${b.customer.name}`,
      detail: `₹${b.totalAmount.toLocaleString("en-IN")}`,
      at: b.createdAt,
    })),
    ...payments.map((p) => ({
      id: `pay-${p.id}`,
      kind: "payment" as const,
      message: `₹${p.amount.toLocaleString("en-IN")} received from ${p.bill.customer.name}`,
      detail: `Bill ${p.bill.billNumber}`,
      at: p.createdAt,
    })),
  ];

  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** "Operator Performance": each operator's activity over the current
 * calendar month — real counts only (work days, hours, pending/rejected
 * readings), no fabricated score. */
export async function getOperatorPerformance(businessId: string) {
  const { start, end } = currentMonthRange();

  const operators = await db.operator.findMany({
    where: { businessId, isArchived: false },
    orderBy: { name: "asc" },
    include: {
      assignedExcavators: { select: { name: true, machineNumber: true }, take: 1 },
    },
  });

  return Promise.all(
    operators.map(async (op) => {
      const [logs, pendingCount, rejectedCount] = await Promise.all([
        db.dailyWorkLog.findMany({
          where: {
            status: "APPROVED",
            date: { gte: start, lte: end },
            workSession: { businessId, operatorId: op.id },
          },
          select: { date: true, hoursWorked: true },
        }),
        db.dailyWorkLog.count({
          where: { status: "PENDING", workSession: { businessId, operatorId: op.id } },
        }),
        db.dailyWorkLog.count({
          where: {
            status: "REJECTED",
            date: { gte: start, lte: end },
            workSession: { businessId, operatorId: op.id },
          },
        }),
      ]);

      const workDays = new Set(logs.map((l) => l.date.toDateString())).size;
      const totalHours = Math.round(logs.reduce((sum, l) => sum + l.hoursWorked, 0) * 100) / 100;
      const avgHoursPerDay = workDays > 0 ? Math.round((totalHours / workDays) * 100) / 100 : 0;

      return {
        id: op.id,
        name: op.name,
        machineName: op.assignedExcavators[0]?.name ?? null,
        machineNumber: op.assignedExcavators[0]?.machineNumber ?? null,
        workDays,
        totalHours,
        avgHoursPerDay,
        pendingReadings: pendingCount,
        rejectedReadings: rejectedCount,
      };
    }),
  );
}

export type PaymentCollectionCustomer = { id: string; name: string; billed: number; paid: number; pending: number };

/** "Payment Collection": how many customers are fully paid vs. still owe
 * something, plus the totals for a stacked collected/pending progress bar
 * and the actual customer breakdown per bucket (shown on the dashboard only
 * once a bucket is tapped — see PaymentCollectionStatus). */
export async function getPaymentCollectionStatus(businessId: string) {
  const bills = await db.bill.findMany({
    where: { businessId },
    select: {
      customerId: true,
      totalAmount: true,
      paidAmount: true,
      customer: { select: { name: true, companyName: true } },
    },
  });

  const byCustomer = new Map<string, { name: string; billed: number; paid: number }>();
  for (const b of bills) {
    const entry = byCustomer.get(b.customerId) ?? {
      name: b.customer.companyName ? `${b.customer.name} — ${b.customer.companyName}` : b.customer.name,
      billed: 0,
      paid: 0,
    };
    entry.billed += b.totalAmount;
    entry.paid += b.paidAmount;
    byCustomer.set(b.customerId, entry);
  }

  let totalBilled = 0;
  let totalReceived = 0;
  const paidCustomers: PaymentCollectionCustomer[] = [];
  const partialCustomers: PaymentCollectionCustomer[] = [];
  const overdueCustomers: PaymentCollectionCustomer[] = []; // "overdue" here = still owes, distinct bucket from "in progress" partial

  for (const [id, { name, billed, paid }] of byCustomer) {
    totalBilled += billed;
    totalReceived += paid;
    const pending = billed - paid;
    const entry: PaymentCollectionCustomer = {
      id,
      name,
      billed: Math.round(billed * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      pending: Math.round(pending * 100) / 100,
    };
    if (pending <= 0.01) paidCustomers.push(entry);
    else if (paid > 0.01) partialCustomers.push(entry);
    else overdueCustomers.push(entry);
  }

  paidCustomers.sort((a, b) => b.billed - a.billed);
  partialCustomers.sort((a, b) => b.pending - a.pending);
  overdueCustomers.sort((a, b) => b.pending - a.pending);

  return {
    paidCount: paidCustomers.length,
    partialCount: partialCustomers.length,
    overdueCount: overdueCustomers.length,
    totalBilled: Math.round(totalBilled * 100) / 100,
    totalReceived: Math.round(totalReceived * 100) / 100,
    totalPending: Math.round((totalBilled - totalReceived) * 100) / 100,
    paidCustomers,
    partialCustomers,
    overdueCustomers,
  };
}

const OVERDUE_GRACE_DAYS = 15;

/** "Overdue Payment Alert": unpaid/partially-paid bills, oldest (and
 * therefore most overdue) first. "Overdue by N days" is measured from the
 * bill date since there's no separate due-date field — a grace period
 * avoids flagging a bill that was only just issued. */
export async function getOverduePayments(businessId: string, limit = 5) {
  const bills = await db.bill.findMany({
    where: { businessId, status: { in: ["UNPAID", "PARTIAL"] } },
    orderBy: { billDate: "asc" },
    select: {
      id: true,
      billNumber: true,
      billDate: true,
      totalAmount: true,
      paidAmount: true,
      customer: { select: { id: true, name: true } },
    },
  });

  const now = Date.now();
  return bills
    .map((b) => ({
      billId: b.id,
      billNumber: b.billNumber,
      customerId: b.customer.id,
      customerName: b.customer.name,
      pending: Math.round((b.totalAmount - b.paidAmount) * 100) / 100,
      daysOverdue: Math.floor((now - b.billDate.getTime()) / 86400000) - OVERDUE_GRACE_DAYS,
    }))
    .filter((b) => b.daysOverdue > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, limit);
}

/** "Top Customers": ranked by all-time revenue, with how much of that is
 * still outstanding. */
export async function getTopCustomersByRevenue(businessId: string, limit = 5) {
  const bills = await db.bill.findMany({
    where: { businessId },
    select: { customerId: true, totalAmount: true, paidAmount: true, customer: { select: { name: true } } },
  });

  const byCustomer = new Map<string, { name: string; revenue: number; received: number }>();
  for (const b of bills) {
    const entry = byCustomer.get(b.customerId) ?? { name: b.customer.name, revenue: 0, received: 0 };
    entry.revenue += b.totalAmount;
    entry.received += b.paidAmount;
    byCustomer.set(b.customerId, entry);
  }

  return [...byCustomer.entries()]
    .map(([customerId, v]) => ({
      customerId,
      name: v.name,
      revenue: Math.round(v.revenue * 100) / 100,
      received: Math.round(v.received * 100) / 100,
      pending: Math.round((v.revenue - v.received) * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/** "Business Profit Overview" for the current calendar month. Expenses are
 * only ever real, already-tracked figures — service costs (ServiceRecord)
 * and operator salary (base + bonus, the accrued monthly cost of having
 * them on payroll, not just what's still unpaid). Fuel/repairs aren't
 * tracked anywhere in the app yet, so they're deliberately left out rather
 * than guessed. */
export async function getProfitOverview(businessId: string) {
  const { start, end } = currentMonthRange();

  const [revenueAgg, serviceRecords, salaryBreakdown] = await Promise.all([
    db.bill.aggregate({ where: { businessId, billDate: { gte: start, lte: end } }, _sum: { totalAmount: true } }),
    db.serviceRecord.findMany({
      where: { businessId, serviceDate: { gte: start, lte: end } },
      select: { cost: true },
    }),
    getSalaryBreakdownForMonth(businessId, start.getFullYear(), start.getMonth()),
  ]);

  const revenue = Math.round((revenueAgg._sum.totalAmount ?? 0) * 100) / 100;
  const serviceCost = Math.round(serviceRecords.reduce((sum, r) => sum + r.cost, 0) * 100) / 100;
  const salaryCost = Math.round(
    salaryBreakdown.reduce((sum, op) => sum + op.baseSalary + op.bonus, 0) * 100,
  ) / 100;

  const expenses = Math.round((serviceCost + salaryCost) * 100) / 100;
  const netProfit = Math.round((revenue - expenses) * 100) / 100;
  const profitMarginPct = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;

  return {
    revenue,
    expenses,
    netProfit,
    profitMarginPct,
    breakdown: [
      { label: "Operator Salary", amount: salaryCost },
      { label: "Service & Maintenance", amount: serviceCost },
    ].filter((b) => b.amount > 0),
  };
}
