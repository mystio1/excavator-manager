import { db } from "@/lib/db";
import { computeServiceStatus } from "@/lib/services/serviceStatus";
import { listOpenWorkRequestsForExcavator } from "@/lib/services/operatorWorkRequests";
import { findOrCreateSite } from "@/lib/services/sites";
import { currentMonthRange } from "@/lib/utils/dates";
import type { AddExcavatorInput, EditExcavatorInput } from "@/lib/validation/excavator";

async function getMaintenanceSettings(businessId: string) {
  return db.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { defaultServiceIntervalHrs: true, maintenanceAlertThresholdHrs: true },
  });
}

export async function listExcavators(businessId: string) {
  const [excavators, { defaultServiceIntervalHrs: defaultInterval, maintenanceAlertThresholdHrs }] = await Promise.all([
    db.excavator.findMany({
      where: { businessId, isArchived: false },
      orderBy: { createdAt: "asc" },
      include: {
        workSessions: {
          where: { status: "ACTIVE" },
          take: 1,
          include: { customer: true, site: true },
        },
        currentOperator: { select: { id: true, name: true } },
        currentSite: { select: { name: true } },
        serviceRecords: {
          orderBy: { serviceDate: "desc" },
          take: 1,
        },
      },
    }),
    getMaintenanceSettings(businessId),
  ]);

  return excavators.map((excavator) => {
    const activeWork = excavator.workSessions[0] ?? null;
    const lastService = excavator.serviceRecords[0] ?? null;
    const serviceStatus = computeServiceStatus({
      currentHourMeter: excavator.currentHourMeter,
      startingHourMeter: excavator.startingHourMeter,
      serviceIntervalHrs: excavator.serviceIntervalHrs,
      businessDefaultIntervalHrs: defaultInterval,
      lastServiceHourMeter: lastService?.hourMeterAtService,
      lastServiceNextDueHour: lastService?.nextServiceDueHour,
      dueSoonThresholdHrs: maintenanceAlertThresholdHrs,
    });

    return {
      id: excavator.id,
      name: excavator.name,
      machineNumber: excavator.machineNumber,
      brand: excavator.brand,
      model: excavator.model,
      currentHourMeter: excavator.currentHourMeter,
      status: excavator.status,
      currentCustomer: activeWork?.customer.name ?? null,
      // A running job's site takes priority (it's what's actually happening
      // right now); otherwise fall back to the machine's stable admin-set
      // default site (Excavator.currentSiteId, see SiteCard) so a site that
      // was set outside of an active job still shows up on the card.
      currentSite: activeWork?.site.name ?? excavator.currentSite?.name ?? null,
      assignedOperator: excavator.currentOperator?.name ?? null,
      serviceStatus,
    };
  });
}

/** Backs the "Machine Performance" section on the excavators list page —
 * hours worked and revenue billed against each machine this calendar month.
 * Revenue combines both billing paths: BillItem.amount for normal
 * WorkSession-based bills, and Bill.totalAmount directly for isDirect bills
 * (which have no BillItem rows). */
export async function getMachinePerformanceSummary(businessId: string) {
  const { start, end } = currentMonthRange();

  const [excavators, billItems, directBills] = await Promise.all([
    db.excavator.findMany({
      where: { businessId, isArchived: false },
      select: {
        id: true,
        name: true,
        machineNumber: true,
        status: true,
        workSessions: {
          where: {
            status: "COMPLETED",
            OR: [{ startDate: { gte: start, lte: end } }, { endDate: { gte: start, lte: end } }],
          },
          select: { totalHours: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.billItem.findMany({
      where: { bill: { businessId, billDate: { gte: start, lte: end } } },
      select: { excavatorId: true, amount: true },
    }),
    db.bill.findMany({
      where: { businessId, isDirect: true, billDate: { gte: start, lte: end }, excavatorId: { not: null } },
      select: { excavatorId: true, totalAmount: true },
    }),
  ]);

  const revenueByExcavator = new Map<string, number>();
  for (const item of billItems) {
    revenueByExcavator.set(item.excavatorId, (revenueByExcavator.get(item.excavatorId) ?? 0) + item.amount);
  }
  for (const bill of directBills) {
    if (!bill.excavatorId) continue;
    revenueByExcavator.set(bill.excavatorId, (revenueByExcavator.get(bill.excavatorId) ?? 0) + bill.totalAmount);
  }

  return excavators.map((e) => ({
    id: e.id,
    name: e.name,
    machineNumber: e.machineNumber,
    status: e.status,
    hoursThisMonth: Math.round(e.workSessions.reduce((sum, s) => sum + s.totalHours, 0) * 100) / 100,
    revenueThisMonth: Math.round((revenueByExcavator.get(e.id) ?? 0) * 100) / 100,
  }));
}

export async function createExcavator(businessId: string, input: AddExcavatorInput) {
  return db.excavator.create({
    data: {
      businessId,
      name: input.name,
      machineNumber: input.machineNumber || null,
      brand: input.brand || null,
      model: input.model || null,
      purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
      startingHourMeter: input.startingHourMeter,
      currentHourMeter: input.startingHourMeter,
      serviceIntervalHrs: input.serviceIntervalHrs ?? null,
    },
  });
}

const IDLE_ALERT_DAYS = 7;

export async function getExcavatorDetail(businessId: string, id: string) {
  const excavator = await db.excavator.findFirst({
    where: { id, businessId },
    include: {
      workSessions: {
        where: { status: "ACTIVE" },
        take: 1,
        include: {
          customer: true,
          site: true,
          dailyLogs: { orderBy: { date: "desc" } },
        },
      },
      currentOperator: { select: { id: true, name: true, mobile: true } },
      currentSite: { select: { id: true, name: true } },
      serviceRecords: { orderBy: { serviceDate: "desc" }, take: 1 },
    },
  });

  if (!excavator) return null;

  const [{ defaultServiceIntervalHrs: defaultInterval, maintenanceAlertThresholdHrs }, operatorWorkRequests, lastCompleted, lastSession] =
    await Promise.all([
      getMaintenanceSettings(businessId),
      listOpenWorkRequestsForExcavator(id),
      db.workSession.findFirst({
        where: { excavatorId: id, status: "COMPLETED" },
        orderBy: { endDate: "desc" },
        select: { endDate: true },
      }),
      // Fallback for the Start Work dialog's Site field when the machine
      // has no currentSiteId set yet — whichever site it was last sent to,
      // regardless of that job's status.
      db.workSession.findFirst({
        where: { excavatorId: id, businessId },
        orderBy: { startDate: "desc" },
        select: { site: { select: { name: true } } },
      }),
    ]);
  const lastService = excavator.serviceRecords[0] ?? null;
  const serviceStatus = computeServiceStatus({
    currentHourMeter: excavator.currentHourMeter,
    startingHourMeter: excavator.startingHourMeter,
    serviceIntervalHrs: excavator.serviceIntervalHrs,
    businessDefaultIntervalHrs: defaultInterval,
    lastServiceHourMeter: lastService?.hourMeterAtService,
    lastServiceNextDueHour: lastService?.nextServiceDueHour,
    dueSoonThresholdHrs: maintenanceAlertThresholdHrs,
  });

  // Idle notice lives here on the machine's own page rather than in the
  // business-wide alert feed — one machine sitting idle isn't urgent enough
  // to surface everywhere, but the owner should still see it when they look
  // at this specific machine.
  const lastIdleSince = lastCompleted?.endDate ?? excavator.createdAt;
  const idleDays = Math.floor((Date.now() - lastIdleSince.getTime()) / (1000 * 60 * 60 * 24));
  const isIdleAlert = excavator.status === "IDLE" && idleDays >= IDLE_ALERT_DAYS;

  return {
    excavator,
    activeWork: excavator.workSessions[0] ?? null,
    operatorWorkRequests,
    serviceStatus,
    idleDays,
    isIdleAlert,
    defaultSiteName: excavator.currentSite?.name ?? lastSession?.site.name ?? null,
  };
}

export async function updateExcavator(businessId: string, id: string, input: EditExcavatorInput) {
  return db.excavator.updateMany({
    where: { id, businessId },
    data: {
      name: input.name,
      machineNumber: input.machineNumber || null,
      brand: input.brand || null,
      model: input.model || null,
      purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
      serviceIntervalHrs: input.serviceIntervalHrs ?? null,
    },
  });
}

export async function archiveExcavator(businessId: string, id: string) {
  return db.excavator.updateMany({ where: { id, businessId }, data: { isArchived: true } });
}

/** Admin's direct site-set — takes effect immediately, unlike an Operator's
 * proposed site change on a job request, which only updates this once
 * approved (see approveWorkRequest in operatorWorkRequests.ts). */
export async function setExcavatorSite(businessId: string, excavatorId: string, siteName: string) {
  const excavator = await db.excavator.findFirst({ where: { id: excavatorId, businessId } });
  if (!excavator) return { error: "Machine not found" } as const;

  const site = await findOrCreateSite(businessId, siteName);

  await db.excavator.update({ where: { id: excavatorId }, data: { currentSiteId: site.id } });
  return { site } as const;
}

export async function listExcavatorOptions(businessId: string) {
  return db.excavator.findMany({
    where: { businessId, isArchived: false },
    select: { id: true, name: true, machineNumber: true, currentHourMeter: true, status: true },
    orderBy: { name: "asc" },
  });
}
