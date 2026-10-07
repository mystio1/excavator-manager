import { db } from "@/lib/db";
import { fail } from "@/lib/api-error";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { withTx, type Tx } from "@/lib/tx";
import { calcHoursFromMeter } from "@/lib/utils/hours";
import type {
  ApproveWorkRequestInput,
  EditOperatorWorkRequestInput,
  EndOperatorWorkInput,
  RejectWorkRequestInput,
  StartOperatorWorkInput,
} from "@/lib/validation/operatorWorkRequest";

const OPEN_STATUSES: string[] = ["ACTIVE", "PENDING", "REJECTED"];

/** Hour-meter readings and diesel litres are measurements (Float columns), not
 * money: kept to 2 dp when written, so 1234.5000000001 never reaches the DB. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Serializes writers of one work request (SELECT … FOR UPDATE) — two admins
 * approving the same request at once must produce exactly ONE work session,
 * and an operator edit must not interleave with a review. */
async function lockWorkRequest(tx: Tx, businessId: string, requestId: string) {
  await tx.$queryRaw`SELECT 1 FROM "OperatorWorkRequest" WHERE "id" = ${requestId} AND "businessId" = ${businessId} FOR UPDATE`;
}

/** Same case-insensitive find-or-create as services/sites.ts, but inside the
 * caller's transaction so a rolled-back approval never leaves a stray site. */
async function findOrCreateSiteInTx(tx: Tx, businessId: string, rawName: string) {
  const name = rawName.trim();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${businessId}:site:${name.toLowerCase()}`}, 0))`;
  const existing = await tx.site.findMany({ where: { businessId } });
  const match = existing.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
  if (match) return match;
  return tx.site.create({ data: { businessId, name } });
}

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
export async function startOperatorWork(
  businessId: string,
  operatorId: string,
  actor: AuditActor,
  input: StartOperatorWorkInput,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    const excavator = await tx.excavator.findFirst({
      where: { businessId, currentOperatorId: operatorId },
      include: { currentSite: { select: { name: true } } },
    });
    if (!excavator) return fail("FORBIDDEN", "You are not assigned to a machine.");

    const activeSession = await tx.workSession.findFirst({
      where: { excavatorId: excavator.id, status: "ACTIVE" },
    });
    if (activeSession) {
      return fail("CONFLICT", "Your admin has already started a job on this machine.");
    }

    const startHourMeter = r2(input.startHourMeter);
    const request = await tx.operatorWorkRequest.create({
      data: {
        businessId,
        excavatorId: excavator.id,
        operatorId,
        startDate: new Date(),
        startHourMeter,
        attachment: input.attachment || null,
        siteName: input.siteName || excavator.currentSite?.name || null,
        dieselLiters: input.dieselLiters == null ? null : r2(input.dieselLiters),
        dieselDate: input.dieselDate ? new Date(input.dieselDate) : null,
        notes: input.notes || null,
        status: "ACTIVE",
      },
    });

    await tx.excavator.update({
      where: { id: excavator.id },
      data: { status: "WORKING", currentHourMeter: startHourMeter, version: { increment: 1 } },
    });

    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.workRequest.start",
      entityType: "OperatorWorkRequest",
      entityId: request.id,
      after: request,
      details: {
        excavatorId: excavator.id,
        excavatorHourMeterBefore: excavator.currentHourMeter,
        excavatorStatusBefore: excavator.status,
      },
    });

    return { request } as const;
  });
}

/** Operator-portal end: also handles resubmission after a Reject (status
 * REJECTED -> PENDING again with the corrected reading). Never touches
 * Excavator.currentHourMeter/status — that only happens once an Admin
 * approves (see approveWorkRequest). */
export async function endOperatorWork(
  businessId: string,
  operatorId: string,
  actor: AuditActor,
  input: EndOperatorWorkInput,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    await lockWorkRequest(tx, businessId, input.requestId);
    const request = await tx.operatorWorkRequest.findFirst({
      where: { id: input.requestId, businessId, operatorId, status: { in: ["ACTIVE", "REJECTED"] } },
    });
    if (!request) return fail("NOT_FOUND", "Job request not found or already reviewed");

    const endHourMeter = r2(input.endHourMeter);
    if (endHourMeter <= request.startHourMeter) {
      return fail("VALIDATION_FAILED", "End hour meter must be greater than the starting hour meter");
    }

    const updated = await tx.operatorWorkRequest.update({
      where: { id: request.id },
      data: {
        endDate: new Date(),
        endHourMeter,
        status: "PENDING",
        rejectionNote: null,
        reviewedAt: null,
      },
    });

    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.workRequest.end",
      entityType: "OperatorWorkRequest",
      entityId: request.id,
      before: request,
      after: updated,
    });

    return { request: updated } as const;
  });
}

/** Lets the operator fix a mistake before or while it's under review —
 * ACTIVE requests can only have the starting reading corrected (nothing
 * ended yet); PENDING requests can have either reading corrected without
 * disturbing their place in the Admin's approval queue. Never touches
 * official records for a PENDING edit; for ACTIVE, the corrected start
 * reading re-syncs Excavator.currentHourMeter the same way starting did. */
export async function editOperatorWorkRequest(
  businessId: string,
  operatorId: string,
  actor: AuditActor,
  input: EditOperatorWorkRequestInput,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    await lockWorkRequest(tx, businessId, input.requestId);
    const request = await tx.operatorWorkRequest.findFirst({
      where: { id: input.requestId, businessId, operatorId, status: { in: ["ACTIVE", "PENDING"] } },
    });
    if (!request) return fail("NOT_FOUND", "Job request not found or already reviewed");

    const startHourMeter = r2(input.startHourMeter);
    const sharedFields = {
      attachment: input.attachment || null,
      siteName: input.siteName || null,
      dieselLiters: input.dieselLiters == null ? null : r2(input.dieselLiters),
      dieselDate: input.dieselDate ? new Date(input.dieselDate) : null,
      notes: input.notes || null,
    };

    if (request.status === "ACTIVE") {
      const updated = await tx.operatorWorkRequest.update({
        where: { id: request.id },
        data: { startHourMeter, ...sharedFields },
      });
      await tx.excavator.update({
        where: { id: request.excavatorId },
        data: { currentHourMeter: startHourMeter, version: { increment: 1 } },
      });
      await recordAudit(tx, {
        businessId,
        actor,
        action: "operator.workRequest.edit",
        entityType: "OperatorWorkRequest",
        entityId: request.id,
        before: request,
        after: updated,
      });
      return { request: updated } as const;
    }

    const endHourMeter = input.endHourMeter == null ? null : r2(input.endHourMeter);
    if (endHourMeter == null || endHourMeter <= startHourMeter) {
      return fail("VALIDATION_FAILED", "End hour meter must be greater than the starting hour meter");
    }
    const updated = await tx.operatorWorkRequest.update({
      where: { id: request.id },
      data: { startHourMeter, endHourMeter, ...sharedFields },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.workRequest.edit",
      entityType: "OperatorWorkRequest",
      entityId: request.id,
      before: request,
      after: updated,
    });
    return { request: updated } as const;
  });
}

/** Operator-portal home: every request for their assigned machine that
 * isn't fully wrapped up yet (ACTIVE/PENDING/REJECTED) — several can be
 * open at once since starting a new job no longer waits on a previous one's
 * approval. Once APPROVED a request stops showing here. */
export async function listOpenOperatorRequests(operatorId: string, excavatorId: string, businessId?: string) {
  return db.operatorWorkRequest.findMany({
    where: { operatorId, excavatorId, ...(businessId ? { businessId } : {}), status: { in: OPEN_STATUSES } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function listRecentOperatorRequests(operatorId: string, excavatorId: string, limit = 5, businessId?: string) {
  return db.operatorWorkRequest.findMany({
    where: { operatorId, excavatorId, ...(businessId ? { businessId } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
}

/** The approval queue. `operator` is returned WITHOUT its credentials
 * (pinHash / tokenVersion) — this list is sent to the browser as JSON. */
export async function listPendingWorkRequests(businessId: string) {
  return db.operatorWorkRequest.findMany({
    where: { businessId, status: "PENDING" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { excavator: true, operator: { omit: { pinHash: true, tokenVersion: true } } },
  });
}

export async function countPendingWorkRequests(businessId: string) {
  return db.operatorWorkRequest.count({ where: { businessId, status: "PENDING" } });
}

/** Admin's excavator page: every request on this machine still awaiting
 * something (visible while ACTIVE, actionable while PENDING) — several can
 * be open at once, see startOperatorWork. Pass `businessId` to also scope the
 * query to the caller's tenant (callers that already verified the machine
 * may omit it). */
export async function listOpenWorkRequestsForExcavator(excavatorId: string, businessId?: string) {
  return db.operatorWorkRequest.findMany({
    where: { excavatorId, ...(businessId ? { businessId } : {}), status: { in: ["ACTIVE", "PENDING"] } },
    include: { operator: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

/** The moment an operator-reported job becomes real: creates the actual
 * billable WorkSession and only now advances Excavator.currentHourMeter and
 * (if changed) Excavator.currentSiteId — see the OperatorWorkRequest model
 * comment for why nothing before this point touches official records.
 *
 * Every field the operator submitted is re-specified here by the Admin
 * (defaulted from the request, but editable) except the operator's
 * identity, which is never up for change on approval.
 *
 * Everything — optional new customer, site, the session, the request's
 * status, the machine's meter — commits in ONE transaction under a row lock
 * on the request, so a double approve (two admins, a retry) creates exactly
 * one WorkSession, and the audit entry records the session it created. */
export async function approveWorkRequest(
  businessId: string,
  actor: AuditActor,
  input: ApproveWorkRequestInput,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    await lockWorkRequest(tx, businessId, input.requestId);
    const request = await tx.operatorWorkRequest.findFirst({ where: { id: input.requestId, businessId } });
    if (!request) return fail("NOT_FOUND", "Request not found or already reviewed");
    if (request.status !== "PENDING") return fail("CONFLICT", "Request not found or already reviewed");

    let customerId = input.customerId;
    let createdCustomerId: string | null = null;
    if (customerId) {
      // A picked customer must belong to THIS business.
      const customer = await tx.customer.findFirst({ where: { id: customerId, businessId }, select: { id: true, isArchived: true } });
      if (!customer) return fail("NOT_FOUND", "Customer not found");
      if (customer.isArchived) return fail("CONFLICT", "This customer was removed. Choose another customer.");
    } else if (input.newCustomerName) {
      const customer = await tx.customer.create({
        data: { businessId, name: input.newCustomerName, mobile: input.newCustomerMobile || "" },
      });
      customerId = customer.id;
      createdCustomerId = customer.id;
    }
    if (!customerId) return fail("VALIDATION_FAILED", "Select a customer or add a new one");

    const excavator = await tx.excavator.findFirst({ where: { id: request.excavatorId, businessId } });
    if (!excavator) return fail("NOT_FOUND", "Machine not found");

    const site = await findOrCreateSiteInTx(tx, businessId, input.siteName);

    const startHourMeter = r2(input.startHourMeter);
    const endHourMeter = r2(input.endHourMeter);
    const totalHours = calcHoursFromMeter(startHourMeter, endHourMeter);

    const session = await tx.workSession.create({
      data: {
        businessId,
        excavatorId: request.excavatorId,
        customerId,
        siteId: site.id,
        operatorId: request.operatorId,
        startDate: request.startDate,
        endDate: request.endDate,
        startHourMeter,
        endHourMeter,
        totalHours,
        attachment: input.attachment || null,
        dieselLiters: input.dieselLiters == null ? null : r2(input.dieselLiters),
        dieselDate: input.dieselDate ? new Date(input.dieselDate) : null,
        notes: input.notes || null,
        status: "COMPLETED",
      },
    });

    const approved = await tx.operatorWorkRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", reviewedAt: new Date(), workSessionId: session.id },
    });

    await tx.excavator.update({
      where: { id: request.excavatorId },
      data: { status: "IDLE", currentHourMeter: endHourMeter, currentSiteId: site.id, version: { increment: 1 } },
    });

    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.workRequest.approve",
      entityType: "OperatorWorkRequest",
      entityId: request.id,
      before: request,
      after: approved,
      details: {
        workSessionId: session.id,
        customerId,
        createdCustomerId,
        siteId: site.id,
        totalHours,
        excavatorId: excavator.id,
        excavatorHourMeterBefore: excavator.currentHourMeter,
        excavatorHourMeterAfter: endHourMeter,
        excavatorStatusBefore: excavator.status,
      },
    });

    return { session } as const;
  });
}

/** Sends an ended job back to the operator to fix — the machine stays
 * "WORKING" at its last approved reading (the rejected end reading never
 * touched it) until they resubmit and it's approved. */
export async function rejectWorkRequest(
  businessId: string,
  actor: AuditActor,
  input: RejectWorkRequestInput,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    await lockWorkRequest(tx, businessId, input.requestId);
    const request = await tx.operatorWorkRequest.findFirst({ where: { id: input.requestId, businessId } });
    if (!request) return fail("NOT_FOUND", "Request not found or already reviewed");
    if (request.status !== "PENDING") return fail("CONFLICT", "Request not found or already reviewed");

    const rejected = await tx.operatorWorkRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", rejectionNote: input.note || null, reviewedAt: new Date() },
    });

    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.workRequest.reject",
      entityType: "OperatorWorkRequest",
      entityId: request.id,
      before: request,
      after: rejected,
      reason: input.note || null,
    });

    return { ok: true } as const;
  });
}

/** Site Analysis: the raw list of completed readings (one per WorkSession),
 * newest first. The page lets the owner filter by site/customer and then
 * pick exactly which readings to average — this only fetches the candidate
 * pool; selection and the resulting average are computed client-side so
 * changing the checkboxes never needs a round trip. */
export async function listSiteAnalysisReadings(businessId: string) {
  const sessions = await db.workSession.findMany({
    where: { businessId, status: "COMPLETED" },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
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
