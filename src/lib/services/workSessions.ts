import { db } from "@/lib/db";
import { calcHoursFromClock, calcHoursFromMeter } from "@/lib/utils/hours";
import { findOrCreateSite } from "@/lib/services/sites";
import type { DailyLogInput, StartWorkInput, StopWorkInput } from "@/lib/validation/workSession";

/**
 * Starts a job (customer/site/hours) on a machine. The operator is never
 * picked here — it's snapshotted from whichever operator is currently
 * paired with the machine (Excavator.currentOperatorId, set from the
 * Machine page's Assign Operator control), so starting/stopping daily jobs
 * never disturbs that weeks-long pairing.
 */
export async function startWork(businessId: string, input: StartWorkInput) {
  const excavator = await db.excavator.findFirst({ where: { id: input.excavatorId, businessId } });
  if (!excavator) return { error: "Machine not found" } as const;
  if (!excavator.currentOperatorId) {
    return { error: "Assign an operator to this machine first, from the Machine page." } as const;
  }

  const alreadyActive = await db.workSession.findFirst({
    where: { excavatorId: input.excavatorId, status: "ACTIVE" },
  });
  if (alreadyActive) {
    return { error: "This machine already has active work. Stop it first." } as const;
  }

  const openOperatorRequest = await db.operatorWorkRequest.findFirst({
    where: { excavatorId: input.excavatorId, status: { in: ["ACTIVE", "PENDING"] } },
  });
  if (openOperatorRequest) {
    return { error: "The operator has an in-progress job on this machine — review it first." } as const;
  }

  const site = await findOrCreateSite(businessId, input.siteName);

  const session = await db.workSession.create({
    data: {
      businessId,
      excavatorId: input.excavatorId,
      customerId: input.customerId,
      siteId: site.id,
      operatorId: excavator.currentOperatorId,
      startDate: new Date(input.startDate),
      startHourMeter: input.startHourMeter,
      attachment: input.attachment || null,
      status: "ACTIVE",
    },
  });

  await db.excavator.update({
    where: { id: input.excavatorId },
    data: { status: "WORKING", currentHourMeter: input.startHourMeter },
  });

  return { session } as const;
}

async function recomputeTotalHours(workSessionId: string) {
  const approvedLogs = await db.dailyWorkLog.findMany({
    where: { workSessionId, status: "APPROVED" },
  });
  const totalHours = Math.round(approvedLogs.reduce((sum, log) => sum + log.hoursWorked, 0) * 100) / 100;
  await db.workSession.update({ where: { id: workSessionId }, data: { totalHours } });
  return totalHours;
}

function computeHours(input: Pick<DailyLogInput, "startHourMeter" | "endHourMeter" | "startTime" | "stopTime" | "breakMinutes">) {
  return input.startHourMeter != null && input.endHourMeter != null
    ? calcHoursFromMeter(input.startHourMeter, input.endHourMeter)
    : calcHoursFromClock(input.startTime!, input.stopTime!, input.breakMinutes ?? 0);
}

async function checkDuplicateLog(workSessionId: string, date: string) {
  // Dates are always parsed from a bare "YYYY-MM-DD" string (here and in
  // startWork/stopWork), so every log for the same calendar day lands on the
  // exact same UTC-midnight instant — an equality check is enough. Rejected
  // logs don't block a resubmission for the same day.
  return db.dailyWorkLog.findFirst({
    where: { workSessionId, date: new Date(date), status: { in: ["APPROVED", "PENDING"] } },
  });
}

/** Admin path — entered directly by the owner, auto-approved immediately
 * (unchanged behavior from before the operator portal existed). */
export async function addDailyLog(businessId: string, input: DailyLogInput) {
  const session = await db.workSession.findFirst({
    where: { id: input.workSessionId, businessId, status: "ACTIVE" },
  });
  if (!session) return { error: "Work session not found or already stopped" } as const;

  const duplicate = await checkDuplicateLog(session.id, input.date);
  if (duplicate) {
    return { error: "Hours for this date are already logged — edit or remove that entry first" } as const;
  }

  const hoursWorked = computeHours(input);
  if (hoursWorked <= 0) {
    return { error: "Working hours must be greater than 0 — check the times or readings" } as const;
  }

  await db.dailyWorkLog.create({
    data: {
      workSessionId: session.id,
      date: new Date(input.date),
      startTime: input.startTime || null,
      stopTime: input.stopTime || null,
      breakMinutes: input.breakMinutes ?? null,
      startHourMeter: input.startHourMeter ?? null,
      endHourMeter: input.endHourMeter ?? null,
      hoursWorked,
      operatorName: input.operatorName || null,
      dieselLiters: input.dieselLiters ?? null,
      notes: input.notes || null,
      attachment: input.attachment || null,
      source: "ADMIN",
      status: "APPROVED",
      reviewedAt: new Date(),
    },
  });

  await recomputeTotalHours(session.id);

  if (input.endHourMeter != null) {
    await db.excavator.update({
      where: { id: session.excavatorId },
      data: { currentHourMeter: input.endHourMeter },
    });
  }

  // Already-approved (this whole path is auto-approved), so rolled into the
  // session immediately. Diesel is added to whatever's already there (same
  // accumulate-not-overwrite reasoning as stopWork); attachment is set, not
  // merged, since it's the current tool rather than a quantity to sum.
  if (input.dieselLiters != null || input.attachment) {
    await db.workSession.update({
      where: { id: session.id },
      data: {
        ...(input.dieselLiters != null && {
          dieselLiters: (session.dieselLiters ?? 0) + input.dieselLiters,
          dieselDate: new Date(input.date),
        }),
        ...(input.attachment && { attachment: input.attachment }),
      },
    });
  }

  return { hoursWorked } as const;
}

/** Operator-portal path — lands PENDING. Does not move
 * Excavator.currentHourMeter or WorkSession.totalHours until an Admin
 * approves it (see approveDailyLog): maintenance/billing must never see an
 * unapproved reading. */
export async function submitDailyLog(operatorId: string, input: DailyLogInput) {
  // Ownership check is against the machine's *current* pairing, not the
  // session's operatorId snapshot — the operator submitting must be the one
  // currently assigned to this machine right now, not whoever it was
  // assigned to when the job happened to start.
  const session = await db.workSession.findFirst({
    where: { id: input.workSessionId, status: "ACTIVE", excavator: { currentOperatorId: operatorId } },
  });
  if (!session) return { error: "No active job found for your assigned machine" } as const;

  const duplicate = await checkDuplicateLog(session.id, input.date);
  if (duplicate) {
    return { error: "A reading for this date is already submitted" } as const;
  }

  const hoursWorked = computeHours(input);
  if (hoursWorked <= 0) {
    return { error: "Working hours must be greater than 0 — check the times or readings" } as const;
  }

  await db.dailyWorkLog.create({
    data: {
      workSessionId: session.id,
      date: new Date(input.date),
      startTime: input.startTime || null,
      stopTime: input.stopTime || null,
      breakMinutes: input.breakMinutes ?? null,
      startHourMeter: input.startHourMeter ?? null,
      endHourMeter: input.endHourMeter ?? null,
      hoursWorked,
      dieselLiters: input.dieselLiters ?? null,
      notes: input.notes || null,
      attachment: input.attachment || null,
      source: "OPERATOR",
      status: "PENDING",
    },
  });

  return { hoursWorked } as const;
}

export async function listPendingLogs(businessId: string) {
  return db.dailyWorkLog.findMany({
    where: { status: "PENDING", workSession: { businessId } },
    orderBy: { createdAt: "asc" },
    include: {
      workSession: {
        include: { excavator: true, operator: true },
      },
    },
  });
}

export async function countPendingLogs(businessId: string) {
  return db.dailyWorkLog.count({ where: { status: "PENDING", workSession: { businessId } } });
}

/** Admin approves an operator-submitted reading. This is the moment the
 * reading becomes "official" — Excavator.currentHourMeter and the session's
 * totalHours only advance here, so maintenance reminders recalculate
 * immediately off the newly-approved value. */
export async function approveDailyLog(businessId: string, logId: string) {
  const log = await db.dailyWorkLog.findFirst({
    where: { id: logId, status: "PENDING", workSession: { businessId } },
    include: { workSession: true },
  });
  if (!log) return { error: "Reading not found or already reviewed" } as const;

  await db.dailyWorkLog.update({
    where: { id: log.id },
    data: { status: "APPROVED", reviewedAt: new Date() },
  });

  await recomputeTotalHours(log.workSessionId);

  const latestApproved = log.endHourMeter ?? log.startHourMeter;
  if (latestApproved != null) {
    await db.excavator.update({
      where: { id: log.workSession.excavatorId },
      data: { currentHourMeter: latestApproved },
    });
  }

  // Same moment diesel/attachment become "official," mirroring
  // currentHourMeter above — diesel is added to whatever's already on the
  // session (see addDailyLog/stopWork), attachment is set since it's the
  // current tool, not a quantity to sum.
  if (log.dieselLiters != null || log.attachment) {
    await db.workSession.update({
      where: { id: log.workSessionId },
      data: {
        ...(log.dieselLiters != null && {
          dieselLiters: (log.workSession.dieselLiters ?? 0) + log.dieselLiters,
          dieselDate: log.date,
        }),
        ...(log.attachment && { attachment: log.attachment }),
      },
    });
  }

  return { ok: true } as const;
}

export async function rejectDailyLog(businessId: string, logId: string) {
  const log = await db.dailyWorkLog.findFirst({
    where: { id: logId, status: "PENDING", workSession: { businessId } },
  });
  if (!log) return { error: "Reading not found or already reviewed" } as const;

  await db.dailyWorkLog.update({
    where: { id: log.id },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });

  return { ok: true } as const;
}

/** Admin deletes a specific reading (e.g. one entered by mistake) from a
 * machine's history — any status, active or completed session. Always
 * re-sums totalHours from what remains. Only rewinds
 * Excavator.currentHourMeter when the log belonged to the machine's
 * currently ACTIVE session, since that's the only session whose readings
 * still drive the live meter — a completed session's final reading was
 * already fixed at stopWork time and is left untouched. */
export async function deleteDailyLog(businessId: string, logId: string) {
  const log = await db.dailyWorkLog.findFirst({
    where: { id: logId, workSession: { businessId } },
    include: { workSession: true },
  });
  if (!log) return { error: "Reading not found" } as const;

  await db.dailyWorkLog.delete({ where: { id: log.id } });

  await recomputeTotalHours(log.workSessionId);

  // Only an APPROVED log's diesel was ever rolled into the session (see
  // approveDailyLog/addDailyLog) — a still-PENDING one never touched it, so
  // there's nothing to unwind there.
  if (log.status === "APPROVED" && log.dieselLiters != null) {
    await db.workSession.update({
      where: { id: log.workSessionId },
      data: { dieselLiters: Math.max(0, (log.workSession.dieselLiters ?? 0) - log.dieselLiters) },
    });
  }

  if (log.workSession.status === "ACTIVE") {
    const latest = await db.dailyWorkLog.findFirst({
      where: { workSessionId: log.workSessionId, status: "APPROVED" },
      orderBy: { date: "desc" },
    });
    const currentHourMeter = latest
      ? (latest.endHourMeter ?? latest.startHourMeter)
      : log.workSession.startHourMeter;
    if (currentHourMeter != null) {
      await db.excavator.update({
        where: { id: log.workSession.excavatorId },
        data: { currentHourMeter },
      });
    }
    // Only when some remaining log actually reports one — unlike hour meter
    // there's no "original" attachment to fall back to, so an empty result
    // here leaves whatever's already on the session alone rather than
    // wiping out a legitimately-set value.
    if (latest?.attachment) {
      await db.workSession.update({
        where: { id: log.workSessionId },
        data: { attachment: latest.attachment },
      });
    }
  }

  return { ok: true } as const;
}

export async function stopWork(businessId: string, input: StopWorkInput) {
  const session = await db.workSession.findFirst({
    where: { id: input.workSessionId, businessId, status: "ACTIVE" },
  });
  if (!session) return { error: "Work session not found or already stopped" } as const;

  if (input.endHourMeter <= session.startHourMeter) {
    return { error: "End hour meter must be greater than the starting hour meter" } as const;
  }

  const approvedLogs = await db.dailyWorkLog.findMany({
    where: { workSessionId: session.id, status: "APPROVED" },
  });
  const totalHours =
    approvedLogs.length > 0
      ? Math.round(approvedLogs.reduce((sum, log) => sum + log.hoursWorked, 0) * 100) / 100
      : calcHoursFromMeter(session.startHourMeter, input.endHourMeter);

  await db.workSession.update({
    where: { id: session.id },
    data: {
      endDate: new Date(input.endDate),
      endHourMeter: input.endHourMeter,
      totalHours,
      status: "COMPLETED",
      // Added to whatever was already recorded earlier in this job (e.g.
      // from the operator's own start-work entry) rather than replacing it
      // — a machine can get topped up more than once before a job wraps up,
      // and overwriting would silently lose that earlier fill-up. Only
      // touched at all when diesel is actually reported this time; an
      // existing note is likewise left alone when none is given now.
      ...(input.dieselLiters != null && {
        dieselLiters: (session.dieselLiters ?? 0) + input.dieselLiters,
        dieselDate: new Date(input.endDate),
      }),
      ...(input.notes && { notes: input.notes }),
    },
  });

  await db.excavator.update({
    where: { id: session.excavatorId },
    data: { status: "IDLE", currentHourMeter: input.endHourMeter },
  });

  return { totalHours } as const;
}

/** Operator-portal home: the machine they're currently paired with (a
 * stable pairing set from the Machine page, see OperatorAssignment) and, if
 * a job happens to be running on it right now, its readings so they can see
 * Pending/Approved/Rejected. The pairing can be "active" with no job
 * running (e.g. between jobs) — that's expected, not an error state. */
export async function getOperatorPortalState(operatorId: string) {
  const excavator = await db.excavator.findFirst({
    where: { currentOperatorId: operatorId },
    include: { currentSite: { select: { name: true } } },
  });
  if (!excavator) return { excavator: null, activeSession: null };

  const activeSession = await db.workSession.findFirst({
    where: { excavatorId: excavator.id, status: "ACTIVE" },
    include: { customer: true, site: true, dailyLogs: { orderBy: { date: "desc" } } },
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

export async function listWorkHistory(
  businessId: string,
  excavatorId: string,
  filters: WorkHistoryFilters = {},
) {
  return db.workSession.findMany({
    where: {
      businessId,
      excavatorId,
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.siteName ? { site: { name: { contains: filters.siteName } } } : {}),
      ...(filters.operatorId ? { operatorId: filters.operatorId } : {}),
      ...(filters.from ? { startDate: { gte: new Date(filters.from) } } : {}),
      ...(filters.to ? { startDate: { lte: new Date(filters.to) } } : {}),
    },
    orderBy: { startDate: "desc" },
    include: { customer: true, site: true, operator: true, dailyLogs: { orderBy: { date: "desc" } } },
  });
}
