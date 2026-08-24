import { db } from "@/lib/db";
import { calcHoursFromMeter } from "@/lib/utils/hours";
import { findOrCreateSite } from "@/lib/services/sites";
import type {
  ApproveWorkRequestInput,
  EditOperatorWorkRequestInput,
  EndOperatorWorkInput,
  RejectWorkRequestInput,
  StartOperatorWorkInput,
} from "@/lib/validation/operatorWorkRequest";

const OPEN_STATUSES: string[] = ["ACTIVE", "PENDING", "REJECTED"];

/** Operator-portal start: no Customer picked (the operator doesn't choose
 * one — see the OperatorWorkRequest model comment), so this stays
 * live/visible to the Admin immediately (Excavator.currentHourMeter and
 * status update right away, same as an Admin-started job) but creates
 * nothing an Admin needs to approve yet — only ending the job does.
 *
 * Site defaults to whatever the Admin last set on the machine
 * (Excavator.currentSiteId) unless the operator overrides it — an override
 * only actually moves the machine's site once this request is approved.
 *
 * Starting is never blocked by an earlier request of the operator's own
 * that's still unapproved — operators are on-site all day and can't wait on
 * admin review between jobs, so several open requests for the same machine
 * can coexist; the Admin reviews and approves each independently. */
export async function startOperatorWork(operatorId: string, input: StartOperatorWorkInput) {
  const excavator = await db.excavator.findFirst({
    where: { currentOperatorId: operatorId },
    include: { currentSite: { select: { name: true } } },
  });
  if (!excavator) return { error: "You are not assigned to a machine." } as const;

  const activeSession = await db.workSession.findFirst({
    where: { excavatorId: excavator.id, status: "ACTIVE" },
  });
  if (activeSession) {
    return { error: "Your admin has already started a job on this machine." } as const;
  }

  const request = await db.operatorWorkRequest.create({
    data: {
      businessId: excavator.businessId,
      excavatorId: excavator.id,
      operatorId,
      startDate: new Date(),
      startHourMeter: input.startHourMeter,
      attachment: input.attachment || null,
      siteName: input.siteName || excavator.currentSite?.name || null,
      dieselLiters: input.dieselLiters ?? null,
      dieselDate: input.dieselDate ? new Date(input.dieselDate) : null,
      notes: input.notes || null,
      status: "ACTIVE",
    },
  });

  await db.excavator.update({
    where: { id: excavator.id },
    data: { status: "WORKING", currentHourMeter: input.startHourMeter },
  });

  return { request } as const;
}

/** Operator-portal end: also handles resubmission after a Reject (status
 * REJECTED -> PENDING again with the corrected reading). Never touches
 * Excavator.currentHourMeter/status — that only happens once an Admin
 * approves (see approveWorkRequest). */
export async function endOperatorWork(operatorId: string, input: EndOperatorWorkInput) {
  const request = await db.operatorWorkRequest.findFirst({
    where: { id: input.requestId, operatorId, status: { in: ["ACTIVE", "REJECTED"] } },
  });
  if (!request) return { error: "Job request not found or already reviewed" } as const;

  if (input.endHourMeter <= request.startHourMeter) {
    return { error: "End hour meter must be greater than the starting hour meter" } as const;
  }

  const updated = await db.operatorWorkRequest.update({
    where: { id: request.id },
    data: {
      endDate: new Date(),
      endHourMeter: input.endHourMeter,
      status: "PENDING",
      rejectionNote: null,
      reviewedAt: null,
    },
  });

  return { request: updated } as const;
}

/** Lets the operator fix a mistake before or while it's under review —
 * ACTIVE requests can only have the starting reading corrected (nothing
 * ended yet); PENDING requests can have either reading corrected without
 * disturbing their place in the Admin's approval queue. Never touches
 * official records for a PENDING edit; for ACTIVE, the corrected start
 * reading re-syncs Excavator.currentHourMeter the same way starting did. */
export async function editOperatorWorkRequest(operatorId: string, input: EditOperatorWorkRequestInput) {
  const request = await db.operatorWorkRequest.findFirst({
    where: { id: input.requestId, operatorId, status: { in: ["ACTIVE", "PENDING"] } },
  });
  if (!request) return { error: "Job request not found or already reviewed" } as const;

  const sharedFields = {
    attachment: input.attachment || null,
    siteName: input.siteName || null,
    dieselLiters: input.dieselLiters ?? null,
    dieselDate: input.dieselDate ? new Date(input.dieselDate) : null,
    notes: input.notes || null,
  };

  if (request.status === "ACTIVE") {
    const updated = await db.operatorWorkRequest.update({
      where: { id: request.id },
      data: { startHourMeter: input.startHourMeter, ...sharedFields },
    });
    await db.excavator.update({
      where: { id: request.excavatorId },
      data: { currentHourMeter: input.startHourMeter },
    });
    return { request: updated } as const;
  }

  if (input.endHourMeter == null || input.endHourMeter <= input.startHourMeter) {
    return { error: "End hour meter must be greater than the starting hour meter" } as const;
  }
  const updated = await db.operatorWorkRequest.update({
    where: { id: request.id },
    data: { startHourMeter: input.startHourMeter, endHourMeter: input.endHourMeter, ...sharedFields },
  });
  return { request: updated } as const;
}

/** Operator-portal home: every request for their assigned machine that
 * isn't fully wrapped up yet (ACTIVE/PENDING/REJECTED) — several can be
 * open at once since starting a new job no longer waits on a previous one's
 * approval. Once APPROVED a request stops showing here. */
export async function listOpenOperatorRequests(operatorId: string, excavatorId: string) {
  return db.operatorWorkRequest.findMany({
    where: { operatorId, excavatorId, status: { in: OPEN_STATUSES } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listRecentOperatorRequests(operatorId: string, excavatorId: string, limit = 5) {
  return db.operatorWorkRequest.findMany({
    where: { operatorId, excavatorId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function listPendingWorkRequests(businessId: string) {
  return db.operatorWorkRequest.findMany({
    where: { businessId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { excavator: true, operator: true },
  });
}

export async function countPendingWorkRequests(businessId: string) {
  return db.operatorWorkRequest.count({ where: { businessId, status: "PENDING" } });
}

/** Admin's excavator page: every request on this machine still awaiting
 * something (visible while ACTIVE, actionable while PENDING) — several can
 * be open at once, see startOperatorWork. */
export async function listOpenWorkRequestsForExcavator(excavatorId: string) {
  return db.operatorWorkRequest.findMany({
    where: { excavatorId, status: { in: ["ACTIVE", "PENDING"] } },
    include: { operator: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** The moment an operator-reported job becomes real: creates the actual
 * billable WorkSession and only now advances Excavator.currentHourMeter and
 * (if changed) Excavator.currentSiteId — see the OperatorWorkRequest model
 * comment for why nothing before this point touches official records.
 *
 * Every field the operator submitted is re-specified here by the Admin
 * (defaulted from the request, but editable) except the operator's
 * identity, which is never up for change on approval. */
export async function approveWorkRequest(businessId: string, input: ApproveWorkRequestInput) {
  const request = await db.operatorWorkRequest.findFirst({
    where: { id: input.requestId, businessId, status: "PENDING" },
  });
  if (!request) {
    return { error: "Request not found or already reviewed" } as const;
  }

  let customerId = input.customerId;
  if (!customerId && input.newCustomerName) {
    const customer = await db.customer.create({
      data: { businessId, name: input.newCustomerName, mobile: input.newCustomerMobile || "" },
    });
    customerId = customer.id;
  }
  if (!customerId) return { error: "Select a customer or add a new one" } as const;

  const site = await findOrCreateSite(businessId, input.siteName);

  const totalHours = calcHoursFromMeter(input.startHourMeter, input.endHourMeter);

  const session = await db.workSession.create({
    data: {
      businessId,
      excavatorId: request.excavatorId,
      customerId,
      siteId: site.id,
      operatorId: request.operatorId,
      startDate: request.startDate,
      endDate: request.endDate,
      startHourMeter: input.startHourMeter,
      endHourMeter: input.endHourMeter,
      totalHours,
      attachment: input.attachment || null,
      dieselLiters: input.dieselLiters ?? null,
      dieselDate: input.dieselDate ? new Date(input.dieselDate) : null,
      notes: input.notes || null,
      status: "COMPLETED",
    },
  });

  await db.operatorWorkRequest.update({
    where: { id: request.id },
    data: { status: "APPROVED", reviewedAt: new Date(), workSessionId: session.id },
  });

  await db.excavator.update({
    where: { id: request.excavatorId },
    data: { status: "IDLE", currentHourMeter: input.endHourMeter, currentSiteId: site.id },
  });

  return { session } as const;
}

/** Sends an ended job back to the operator to fix — the machine stays
 * "WORKING" at its last approved reading (the rejected end reading never
 * touched it) until they resubmit and it's approved. */
export async function rejectWorkRequest(businessId: string, input: RejectWorkRequestInput) {
  const request = await db.operatorWorkRequest.findFirst({
    where: { id: input.requestId, businessId, status: "PENDING" },
  });
  if (!request) return { error: "Request not found or already reviewed" } as const;

  await db.operatorWorkRequest.update({
    where: { id: request.id },
    data: { status: "REJECTED", rejectionNote: input.note || null, reviewedAt: new Date() },
  });

  return { ok: true } as const;
}

/** Site Analysis: the raw list of completed readings (one per WorkSession),
 * newest first. The page lets the owner filter by site/customer and then
 * pick exactly which readings to average — this only fetches the candidate
 * pool; selection and the resulting average are computed client-side so
 * changing the checkboxes never needs a round trip. */
export async function listSiteAnalysisReadings(businessId: string) {
  const sessions = await db.workSession.findMany({
    where: { businessId, status: "COMPLETED" },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      siteId: true,
      excavatorId: true,
      customerId: true,
      startDate: true,
      endDate: true,
      startHourMeter: true,
      endHourMeter: true,
      totalHours: true,
      attachment: true,
      dieselLiters: true,
      site: { select: { name: true } },
      excavator: { select: { name: true, machineNumber: true } },
      customer: { select: { name: true } },
    },
  });

  return sessions.map((s) => ({
    id: s.id,
    siteId: s.siteId,
    siteName: s.site.name,
    excavatorId: s.excavatorId,
    excavatorName: s.excavator.name,
    machineNumber: s.excavator.machineNumber,
    customerId: s.customerId,
    customerName: s.customer.name,
    startDate: s.startDate,
    endDate: s.endDate,
    startHourMeter: s.startHourMeter,
    endHourMeter: s.endHourMeter ?? s.startHourMeter,
    totalHours: s.totalHours,
    attachment: s.attachment,
    dieselLiters: s.dieselLiters,
  }));
}
