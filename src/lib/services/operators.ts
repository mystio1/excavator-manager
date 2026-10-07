import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Operator, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ApiHttpError, fail } from "@/lib/api-error";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { LEGACY_LIMIT, pageArgs, toPage, type PageParams } from "@/lib/pagination";
import { hashPassword } from "@/lib/password";
import { consumeRateLimit } from "@/lib/rateLimit";
import { isStale, resourceModified, withTx, type Tx } from "@/lib/tx";
import { normalizeBusinessCode } from "@/lib/utils/businessCode";
import {
  JOIN_CODE_PATTERN,
  NEW_PIN_MESSAGE,
  NEW_PIN_PATTERN,
  type AddOperatorInput,
  type UpdateOperatorInput,
} from "@/lib/validation/operator";

/** Cursor-paged operator list (key `operators` + `nextCursor` at the route). */
export async function listOperatorsPage(businessId: string, page: PageParams) {
  const rows = await db.operator.findMany({
    where: { businessId, isArchived: false },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      name: true,
      mobile: true,
      defaultMonthlySalary: true,
      assignedExcavators: { select: { name: true, machineNumber: true }, take: 1 },
    },
    ...pageArgs(page),
  });
  const { items, nextCursor } = toPage(rows, page.limit);

  // "Requested to join" = an unexpired PENDING join request is linked to this
  // operator row (the request itself never touches the Operator row).
  const linked = items.length
    ? await db.operatorJoinRequest.findMany({
        where: {
          businessId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
          operatorId: { in: items.map((op) => op.id) },
        },
        select: { operatorId: true },
      })
    : [];
  const withPending = new Set(linked.map((r) => r.operatorId));

  const operators = items.map((op) => ({
    id: op.id,
    name: op.name,
    mobile: op.mobile,
    defaultMonthlySalary: op.defaultMonthlySalary,
    currentExcavator: op.assignedExcavators[0]?.name ?? null,
    joinPending: withPending.has(op.id),
  }));
  return { operators, nextCursor };
}

/** First (bounded) page of the operator list — kept for callers that just want
 * the array. */
export async function listOperators(businessId: string) {
  const { operators } = await listOperatorsPage(businessId, { limit: LEGACY_LIMIT, cursor: undefined });
  return operators;
}

/** Set from the operator's own portal home page — their personal choice,
 * independent of (and overriding) the admin's business-wide default. */
export async function updateOperatorOwnLanguage(operatorId: string, language: "en" | "hi" | "mr") {
  await db.operator.update({ where: { id: operatorId }, data: { language } });
}

const RANKING_WINDOW_DAYS = 45;

/** "Ranking" section on the Operators page — total hours each operator has
 * actually driven across all their machines over the last 45 days. Mirrors
 * the dashboard's overlap-safe hour-counting: logged days come from
 * DailyWorkLog, and any session with no daily log at all (billed straight
 * off start/end readings) still counts its full totalHours if it overlaps
 * the window, so no worked hour is silently dropped or double-counted. */
export async function getOperatorRankingLast45Days(businessId: string) {
  const end = new Date();
  const start = new Date(end.getTime() - RANKING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // None of these three depend on each other's results — fired together
  // instead of fetching operators first, then logs/sessions after.
  const [operators, logs, sessionsWithoutLogs] = await Promise.all([
    db.operator.findMany({
      where: { businessId, isArchived: false },
      select: { id: true, name: true },
    }),
    db.dailyWorkLog.findMany({
      where: { status: "APPROVED", date: { gte: start, lte: end }, workSession: { businessId } },
      select: { hoursWorked: true, workSession: { select: { operatorId: true } } },
    }),
    db.workSession.findMany({
      where: {
        businessId,
        dailyLogs: { none: {} },
        OR: [{ startDate: { gte: start, lte: end } }, { endDate: { gte: start, lte: end } }],
      },
      select: { operatorId: true, totalHours: true },
    }),
  ]);
  if (operators.length === 0) return [];

  const hoursByOperator = new Map<string, number>();
  for (const log of logs) {
    const opId = log.workSession.operatorId;
    hoursByOperator.set(opId, (hoursByOperator.get(opId) ?? 0) + log.hoursWorked);
  }
  for (const s of sessionsWithoutLogs) {
    hoursByOperator.set(s.operatorId, (hoursByOperator.get(s.operatorId) ?? 0) + s.totalHours);
  }

  return operators
    .map((op) => ({ id: op.id, name: op.name, hours: Math.round((hoursByOperator.get(op.id) ?? 0) * 100) / 100 }))
    .sort((a, b) => b.hours - a.hours);
}

/** Row lock on one operator (scoped by business) so concurrent edits / PIN
 * changes / approvals serialize; returns the row as it is AFTER the lock. */
async function lockOperator(tx: Tx, businessId: string, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Operator" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`;
  if (rows.length === 0) return null;
  return tx.operator.findUnique({ where: { id } });
}

const operatorNotFound = () => fail("NOT_FOUND", "Operator not found");

/** maxOperators is support-console-managed (see src/lib/services/support.ts)
 * — null/unset for every business until support deliberately caps one.
 * Locks the business row while counting so two concurrent creators (or a
 * creator and a join approval) cannot both slip under the cap. */
async function checkOperatorLimit(tx: Tx, businessId: string) {
  const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { maxOperators: true } });
  if (business.maxOperators == null) return null;
  await tx.$queryRaw`SELECT 1 FROM "Business" WHERE "id" = ${businessId} FOR UPDATE`;
  const activeCount = await tx.operator.count({ where: { businessId, isArchived: false } });
  if (activeCount >= business.maxOperators) {
    return fail("CONFLICT", `You've reached your plan's limit of ${business.maxOperators} operators. Contact support to raise it.`);
  }
  return null;
}

export async function createOperator(
  businessId: string,
  actor: AuditActor,
  input: AddOperatorInput,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    const limited = await checkOperatorLimit(tx, businessId);
    if (limited) return limited;

    const operator = await tx.operator.create({
      data: {
        businessId,
        name: input.name,
        mobile: input.mobile,
        address: input.address || null,
        joiningDate: input.joiningDate ? new Date(input.joiningDate) : null,
        defaultMonthlySalary: round2(input.defaultMonthlySalary ?? 0),
      },
      // The row goes back to the browser: credentials never leave the server.
      omit: { pinHash: true },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.create",
      entityType: "Operator",
      entityId: operator.id,
      after: operator,
    });
    // tokenVersion is session-revocation state — never sent to the browser.
    const { tokenVersion: _omitted, ...publicOperator } = operator;
    void _omitted;
    return { operator: publicOperator } as const;
  });
}

/** Edit an operator's profile. `input.expectedVersion` (the `version` the
 * client loaded) turns a lost-update into a RESOURCE_MODIFIED conflict. */
export async function updateOperator(
  businessId: string,
  actor: AuditActor,
  id: string,
  input: UpdateOperatorInput,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    const before = await lockOperator(tx, businessId, id);
    if (!before) return operatorNotFound();
    if (isStale(before.version, input.expectedVersion)) return resourceModified("operator");

    const after = await tx.operator.update({
      where: { id },
      data: {
        name: input.name,
        mobile: input.mobile,
        address: input.address || null,
        joiningDate: input.joiningDate ? new Date(input.joiningDate) : null,
        defaultMonthlySalary: round2(input.defaultMonthlySalary ?? 0),
        version: { increment: 1 },
      },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.update",
      entityType: "Operator",
      entityId: id,
      before,
      after,
    });
    return { ok: true, version: after.version } as const;
  });
}

/** Soft-delete. Also bumps tokenVersion so any session the operator still
 * holds dies immediately, not only at its next natural expiry. */
export async function archiveOperator(
  businessId: string,
  actor: AuditActor,
  id: string,
  expectedVersion?: number,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    const before = await lockOperator(tx, businessId, id);
    if (!before) return operatorNotFound();
    if (before.isArchived) return { ok: true, version: before.version } as const;
    if (isStale(before.version, expectedVersion)) return resourceModified("operator");

    const after = await tx.operator.update({
      where: { id },
      data: { isArchived: true, tokenVersion: { increment: 1 }, version: { increment: 1 } },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.archive",
      entityType: "Operator",
      entityId: id,
      before,
      after,
    });
    return { ok: true, version: after.version } as const;
  });
}

export async function getOperatorDetail(businessId: string, id: string) {
  const operator = await db.operator.findFirst({
    where: { id, businessId },
    include: { assignedExcavators: { select: { id: true, name: true, machineNumber: true } } },
  });
  if (!operator) return null;

  // Job history (customer/site/hours) — independent of the operator<->machine
  // pairing itself, which lives in OperatorAssignment (see operatorAssignments.ts).
  const pastWork = await db.workSession.findMany({
    where: { operatorId: id, businessId, status: "COMPLETED" },
    orderBy: { startDate: "desc" },
    take: 20,
    include: { excavator: { select: { name: true, machineNumber: true } }, customer: true, site: true },
  });

  // The PIN hash must never be shipped to a browser. The detail view only needs
  // to know whether a PIN exists: `hasPin` says so, and `pinHash` keeps its key
  // (installed Android apps test `!!operator.pinHash`) with a non-secret marker.
  const { pinHash, ...withVersion } = operator;
  // tokenVersion is session-revocation state — never sent to the browser.
  const safe: Omit<typeof withVersion, "tokenVersion"> & { tokenVersion?: number } = withVersion;
  delete safe.tokenVersion;
  return {
    operator: { ...safe, pinHash: pinHash ? "set" : null, hasPin: pinHash !== null },
    assignedExcavator: operator.assignedExcavators[0] ?? null,
    pastWork,
  };
}

/**
 * Admin-side portal login management for an existing operator (the
 * "Operator Portal Login" card). The operator's OWN way in is the join-request
 * flow below — an unauthenticated visitor can never reach this.
 *
 * Disabling portal login clears the PIN too — re-enabling later always
 * requires a fresh PIN (set by the Admin here, or by the operator via
 * /operator-signup and then approved), never silently reactivating an old one.
 *
 * Setting/resetting a PIN or disabling login bumps `tokenVersion`, which kills
 * every session JWT already issued to this operator.
 */
export async function setOperatorPin(
  businessId: string,
  actor: AuditActor,
  id: string,
  input: { canLogin: boolean; pin?: string; expectedVersion?: number },
  opts?: { tx?: Tx },
) {
  const pin = input.canLogin && input.pin ? input.pin : undefined;
  if (pin !== undefined && !NEW_PIN_PATTERN.test(pin)) return fail("VALIDATION_FAILED", NEW_PIN_MESSAGE);
  // bcrypt is deliberately slow — keep it outside the transaction.
  const pinHash = pin !== undefined ? await hashPassword(pin) : undefined;

  return withTx(opts?.tx, async (tx) => {
    const before = await lockOperator(tx, businessId, id);
    if (!before) return operatorNotFound();
    if (input.canLogin && before.isArchived) return operatorNotFound();
    if (isStale(before.version, input.expectedVersion)) return resourceModified("operator");

    let action: string;
    let data: Prisma.OperatorUpdateInput;
    if (!input.canLogin) {
      action = "operator.login.disable";
      data = { canLogin: false, pinHash: null, tokenVersion: { increment: 1 } };
    } else if (pinHash !== undefined) {
      action = before.pinHash ? "operator.pin.reset" : "operator.pin.set";
      data = { canLogin: true, pinHash, tokenVersion: { increment: 1 } };
    } else if (before.canLogin) {
      return { ok: true, version: before.version } as const; // nothing to change
    } else {
      action = "operator.login.enable";
      data = { canLogin: true };
    }

    const after = await tx.operator.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    await recordAudit(tx, { businessId, actor, action, entityType: "Operator", entityId: id, before, after });
    return { ok: true, version: after.version } as const;
  });
}

// ---------------------------------------------------------------------------
// Operator join flow
//
// An operator who knows a business code asks to join by creating an
// OperatorJoinRequest. That request NEVER touches an Operator row: knowing a
// business code and somebody's mobile number must not be enough to set or
// overwrite their PIN (it used to be). Only an admin approval — which needs the
// 6-digit verification code shown once to the requester — turns a request into
// working credentials.
// ---------------------------------------------------------------------------

const JOIN_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING_JOIN_REQUESTS = 50;
export const MAX_JOIN_CODE_ATTEMPTS = 5;

/** Per-IP lockout on INVALID business codes, so codes cannot be enumerated. */
export const BAD_CODE_LIMIT = 5;
export const BAD_CODE_WINDOW_MS = 15 * 60 * 1000;
const badCodeKey = (ip: string) => `operator-signup:badcode:ip:${ip}`;

/** HMAC-SHA256 of the verification code, domain-separated and bound to the
 * request id. The plaintext code is never stored.
 *
 * Keyed by JOIN_CODE_SECRET when set, so a leak or rotation of AUTH_SECRET (the
 * session key) does not also expose or invalidate join codes. It falls back to
 * AUTH_SECRET so existing deployments keep working unchanged; set
 * JOIN_CODE_SECRET to separate the keys (pending requests issued under the old
 * key must be declined and re-filed — a request is valid for 7 days). */
export function hashJoinCode(requestId: string, code: string): string {
  const secret = process.env.JOIN_CODE_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("JOIN_CODE_SECRET (or AUTH_SECRET) must be set to issue operator join codes");
  return createHmac("sha256", secret).update(`operator-join:${requestId}:${code}`).digest("hex");
}

function joinCodeMatches(requestId: string, storedHash: string, code: string): boolean {
  const expected = Buffer.from(hashJoinCode(requestId, code), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return expected.length === stored.length && timingSafeEqual(expected, stored);
}

function generateJoinCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Read-only look at a rate-limit counter (same sliding-window maths as
 * consumeRateLimit, without incrementing it). */
async function isRateLimitExhausted(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const prevStart = new Date(windowStart.getTime() - windowMs);
  const rows = await db.$queryRaw<{ cur: number; prev: number }[]>`
    SELECT
      COALESCE((SELECT "count" FROM "RateLimitBucket" WHERE "key" = ${key} AND "windowStart" = ${windowStart}), 0) AS cur,
      COALESCE((SELECT "count" FROM "RateLimitBucket" WHERE "key" = ${key} AND "windowStart" = ${prevStart}), 0) AS prev`;
  const cur = Number(rows[0]?.cur ?? 0);
  const prev = Number(rows[0]?.prev ?? 0);
  const effective = cur + prev * (1 - (now - windowStart.getTime()) / windowMs);
  const retryAfterSec = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000));
  return { exhausted: effective >= limit, retryAfterSec };
}

/** Call BEFORE touching the business-code lookup: an IP that already burned its
 * invalid-code allowance is refused outright — valid codes included — so the
 * block cannot be used as a "which codes exist" oracle. Throws 429 + Retry-After. */
export async function assertBusinessCodeAttemptsAllowed(ip: string) {
  const { exhausted, retryAfterSec } = await isRateLimitExhausted(badCodeKey(ip), BAD_CODE_LIMIT, BAD_CODE_WINDOW_MS);
  if (exhausted) {
    throw new ApiHttpError("RATE_LIMITED", "Too many invalid business codes. Please wait a while and try again.", {
      headers: { "Retry-After": String(retryAfterSec) },
      details: { retryAfterSec },
    });
  }
}

/** Counts one invalid business code against this IP. */
export async function recordInvalidBusinessCode(ip: string) {
  await consumeRateLimit({ key: badCodeKey(ip), limit: BAD_CODE_LIMIT, windowMs: BAD_CODE_WINDOW_MS });
}

type ExistingOperatorMatch =
  | { kind: "none" }
  | { kind: "match"; operator: { id: string } }
  | { kind: "has-credentials" };

/** The existing (non-archived) operator of this business with this mobile, if
 * any. If ANY such row already has working credentials the number is taken. */
async function matchExistingOperator(tx: Tx, businessId: string, mobile: string): Promise<ExistingOperatorMatch> {
  const rows = await tx.operator.findMany({
    where: { businessId, mobile, isArchived: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 10,
    select: { id: true, canLogin: true, pinHash: true },
  });
  if (rows.some((op) => op.canLogin && op.pinHash)) return { kind: "has-credentials" };
  const first = rows[0];
  return first ? { kind: "match", operator: { id: first.id } } : { kind: "none" };
}

// Existing user-facing strings keep their exact text: installed apps translate
// them (hi/mr) by exact-match lookup.
const ALREADY_REGISTERED = "This mobile number is already registered — log in instead.";

/**
 * Operator self-service join request. Creates an OperatorJoinRequest and
 * returns the one-time verification code; it does not create or modify any
 * Operator row, whatever the mobile number matches.
 *
 * The code is returned ONCE and also embedded in `message`, because installed
 * Android apps only display `message`. Only its HMAC is stored.
 */
export async function requestOperatorJoin(businessCode: string, name: string, mobile: string, pin: string) {
  const business = await db.business.findUnique({
    where: { code: normalizeBusinessCode(businessCode) },
    select: { id: true },
  });
  if (!business) return fail("NOT_FOUND", "Invalid business code — check with your admin.");

  const mobileTrimmed = mobile.trim();
  // bcrypt is deliberately slow — keep it outside the transaction.
  const pinHash = await hashPassword(pin);
  const requestId = randomUUID();
  const verificationCode = generateJoinCode();

  const result = await withTx(undefined, async (tx) => {
    // Serialize join requests per business: the "one pending request per
    // number" and "at most 50 pending" rules are check-then-insert, so two
    // simultaneous submissions must not both pass the check.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`operator-join:${business.id}`}))`;

    const now = new Date();
    await tx.operatorJoinRequest.updateMany({
      where: { businessId: business.id, status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });

    const match = await matchExistingOperator(tx, business.id, mobileTrimmed);
    if (match.kind === "has-credentials") return fail("CONFLICT", ALREADY_REGISTERED);

    const duplicate = await tx.operatorJoinRequest.findFirst({
      where: { businessId: business.id, mobile: mobileTrimmed, status: "PENDING", expiresAt: { gt: now } },
      select: { id: true },
    });
    if (duplicate) {
      return fail("CONFLICT", "A request for this number is already waiting for approval - ask your admin.");
    }

    const pending = await tx.operatorJoinRequest.count({
      where: { businessId: business.id, status: "PENDING", expiresAt: { gt: now } },
    });
    if (pending >= MAX_PENDING_JOIN_REQUESTS) {
      return fail("CONFLICT", "Too many join requests are waiting for this business - ask your admin to clear them.");
    }

    await tx.operatorJoinRequest.create({
      data: {
        id: requestId,
        businessId: business.id,
        name: name.trim(),
        mobile: mobileTrimmed,
        pinHash,
        verificationHash: hashJoinCode(requestId, verificationCode),
        status: "PENDING",
        operatorId: match.kind === "match" ? match.operator.id : null,
        expiresAt: new Date(now.getTime() + JOIN_REQUEST_TTL_MS),
      },
    });
    return null;
  });
  if (result) return result;

  return {
    ok: true,
    status: "PENDING",
    verificationCode,
    message: `Request submitted! Your verification code is ${verificationCode} - give it to your admin, who needs it to approve you.`,
  } as const;
}

export type PendingJoinRequest = {
  id: string;
  name: string;
  mobile: string;
  createdAt: Date;
  expiresAt: Date;
  /** false only for legacy requests migrated from the old flow. */
  requiresCode: boolean;
  /** The existing operator row this request will be attached to on approval. */
  linkedOperator?: { id: string; name: string };
};

/** Pending, unexpired join requests of this business. Never includes a hash. */
export async function listPendingJoinRequests(businessId: string): Promise<PendingJoinRequest[]> {
  const now = new Date();
  // Housekeeping: flip lapsed requests so they stop counting as pending.
  await db.operatorJoinRequest.updateMany({
    where: { businessId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

  const rows = await db.operatorJoinRequest.findMany({
    where: { businessId, status: "PENDING", expiresAt: { gt: now } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_PENDING_JOIN_REQUESTS,
    select: {
      id: true,
      name: true,
      mobile: true,
      createdAt: true,
      expiresAt: true,
      operatorId: true,
      verificationHash: true,
    },
  });

  const operatorIds = rows.flatMap((r) => (r.operatorId ? [r.operatorId] : []));
  const operators = operatorIds.length
    ? await db.operator.findMany({ where: { businessId, id: { in: operatorIds } }, select: { id: true, name: true } })
    : [];
  const byId = new Map(operators.map((op) => [op.id, op]));

  return rows.map((r) => {
    const linked = r.operatorId ? byId.get(r.operatorId) : undefined;
    return {
      id: r.id,
      name: r.name,
      mobile: r.mobile,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      requiresCode: r.verificationHash !== "",
      ...(linked ? { linkedOperator: { id: linked.id, name: linked.name } } : {}),
    };
  });
}

/** Row lock on one join request (scoped by business). */
async function lockJoinRequest(tx: Tx, businessId: string, requestId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "OperatorJoinRequest" WHERE "id" = ${requestId} AND "businessId" = ${businessId} FOR UPDATE`;
  if (rows.length === 0) return null;
  return tx.operatorJoinRequest.findUnique({ where: { id: requestId } });
}

const joinRequestNotFound = () => fail("NOT_FOUND", "Join request not found.");

function notPendingFailure(status: string) {
  switch (status) {
    case "APPROVED":
      return fail("CONFLICT", "This request was already approved.");
    case "REJECTED":
      return fail("CONFLICT", "This request was already declined.");
    case "EXPIRED":
      return fail("CONFLICT", "This request has expired. Ask the operator to submit a new one.");
    case "LOCKED":
      return fail("CONFLICT", "This request is locked after too many wrong codes. Ask the operator to submit a new one.");
    default:
      return fail("CONFLICT", "This request is no longer pending.");
  }
}

/**
 * Approve a join request: ONE transaction that locks the request, checks the
 * verification code, and only then creates / activates the operator.
 *
 *  - The request must belong to this business, be PENDING and unexpired.
 *  - Requests with a verification code need the right 6-digit code (HMAC
 *    compared in constant time). Each wrong code is counted; the
 *    MAX_JOIN_CODE_ATTEMPTS-th wrong one LOCKS the request for good, so the code
 *    cannot be brute-forced and a stolen/guessed approval cannot be replayed.
 *  - A correct code consumes the request (APPROVED) — approving twice fails.
 *  - If the request is linked to an existing operator, that operator must be in
 *    this business, active, and must not already hold working credentials; it
 *    keeps its name/history and gets the requested PIN + tokenVersion+1.
 *    Otherwise a new Operator is created (respecting the business's
 *    maxOperators cap).
 *  - Legacy requests (verificationHash = '') approve without a code.
 *
 * Failures are returned as values; the wrong-code counter / lock / expiry flip
 * are real writes that commit with them, so this deliberately does not accept a
 * caller's transaction (a rollback there would reset the brute-force counter).
 */
export async function approveJoinRequest(businessId: string, actor: AuditActor, requestId: string, code?: string) {
  return withTx(undefined, async (tx) => {
    const request = await lockJoinRequest(tx, businessId, requestId);
    if (!request) return joinRequestNotFound();
    if (request.status !== "PENDING") return notPendingFailure(request.status);

    const now = new Date();
    if (request.expiresAt <= now) {
      await tx.operatorJoinRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
      return notPendingFailure("EXPIRED");
    }

    if (request.verificationHash !== "") {
      const supplied = code?.trim() ?? "";
      if (!JOIN_CODE_PATTERN.test(supplied)) {
        // Malformed input cannot match, so it is not counted as an attempt.
        return fail("VALIDATION_FAILED", "Enter the 6-digit verification code");
      }
      if (!joinCodeMatches(request.id, request.verificationHash, supplied)) {
        const attempts = request.verifyAttempts + 1;
        if (attempts >= MAX_JOIN_CODE_ATTEMPTS) {
          const locked = await tx.operatorJoinRequest.update({
            where: { id: request.id },
            data: { verifyAttempts: attempts, status: "LOCKED", decidedAt: now },
          });
          await recordAudit(tx, {
            businessId,
            actor,
            action: "operator.join.locked",
            entityType: "OperatorJoinRequest",
            entityId: request.id,
            before: request,
            after: locked,
            reason: "Too many wrong verification codes",
          });
          return notPendingFailure("LOCKED");
        }
        await tx.operatorJoinRequest.update({ where: { id: request.id }, data: { verifyAttempts: attempts } });
        const left = MAX_JOIN_CODE_ATTEMPTS - attempts;
        return fail(
          "VALIDATION_FAILED",
          `Wrong verification code. ${left} attempt${left === 1 ? "" : "s"} left before this request is locked.`,
        );
      }
    }

    // Code accepted (or legacy request). Resolve which operator row it becomes.
    let target: Operator | null = null;
    if (request.operatorId) {
      target = await lockOperator(tx, businessId, request.operatorId);
      if (!target || target.isArchived) {
        return fail(
          "CONFLICT",
          "The operator this request was linked to no longer exists. Decline it and ask them to request again.",
        );
      }
    } else {
      // The admin may have added this person since the request was filed.
      const match = await matchExistingOperator(tx, businessId, request.mobile);
      if (match.kind === "match") target = await lockOperator(tx, businessId, match.operator.id);
      if (match.kind === "has-credentials") return fail("CONFLICT", ALREADY_REGISTERED);
    }
    if (target && target.canLogin && target.pinHash) {
      return fail("CONFLICT", "This operator already has a working login. Decline this request.");
    }

    let operatorBefore: Operator | null = target;
    let operatorAfter: Operator;
    if (target) {
      operatorAfter = await tx.operator.update({
        where: { id: target.id },
        data: {
          pinHash: request.pinHash,
          canLogin: true,
          tokenVersion: { increment: 1 },
          version: { increment: 1 },
        },
      });
    } else {
      const limited = await checkOperatorLimit(tx, businessId);
      if (limited) return limited;
      operatorBefore = null;
      operatorAfter = await tx.operator.create({
        data: { businessId, name: request.name, mobile: request.mobile, pinHash: request.pinHash, canLogin: true },
      });
    }

    const approved = await tx.operatorJoinRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", decidedAt: now, decidedBy: actor.id, operatorId: operatorAfter.id },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.join.approve",
      entityType: "OperatorJoinRequest",
      entityId: request.id,
      before: request,
      after: approved,
      details: { operatorId: operatorAfter.id, createdOperator: operatorBefore === null },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: operatorBefore ? "operator.login.enable" : "operator.create",
      entityType: "Operator",
      entityId: operatorAfter.id,
      before: operatorBefore ?? undefined,
      after: operatorAfter,
      reason: "Join request approved",
    });

    return {
      ok: true,
      createdOperator: operatorBefore === null,
      operator: { id: operatorAfter.id, name: operatorAfter.name, mobile: operatorAfter.mobile },
    } as const;
  });
}

/** Reject a pending join request (the requester is never told why). */
export async function declineJoinRequest(businessId: string, actor: AuditActor, requestId: string) {
  return withTx(undefined, async (tx) => {
    const request = await lockJoinRequest(tx, businessId, requestId);
    if (!request) return joinRequestNotFound();
    if (request.status !== "PENDING") return notPendingFailure(request.status);

    const rejected = await tx.operatorJoinRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", decidedAt: new Date(), decidedBy: actor.id },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "operator.join.reject",
      entityType: "OperatorJoinRequest",
      entityId: request.id,
      before: request,
      after: rejected,
    });
    return { ok: true } as const;
  });
}

/** Older admin UIs address a join request by the OPERATOR id (the pending row
 * used to live on the Operator itself); the current list returns request ids as
 * `id`. Accepts either and returns the PENDING request it refers to. */
async function findPendingRequestForLegacyId(businessId: string, idOrOperatorId: string) {
  return db.operatorJoinRequest.findFirst({
    where: { businessId, status: "PENDING", OR: [{ id: idOrOperatorId }, { operatorId: idOrOperatorId }] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, verificationHash: true },
  });
}

/** `/api/operators/[id]/approve-join` for installed apps with the old admin UI.
 * They cannot type a verification code, so only legacy (code-less) requests can
 * be approved this way. */
export async function approveJoinRequestLegacy(businessId: string, actor: AuditActor, idOrOperatorId: string) {
  const target = await findPendingRequestForLegacyId(businessId, idOrOperatorId);
  if (!target) return fail("NOT_FOUND", "No pending join request found.");
  if (target.verificationHash !== "") {
    return fail(
      "CONFLICT",
      "This join request has a verification code, which your version of the app cannot enter. Please update the app, or approve it from the web app.",
    );
  }
  return approveJoinRequest(businessId, actor, target.id);
}

/** `/api/operators/[id]/decline-join` for installed apps with the old admin UI. */
export async function declineJoinRequestLegacy(businessId: string, actor: AuditActor, idOrOperatorId: string) {
  const target = await findPendingRequestForLegacyId(businessId, idOrOperatorId);
  if (!target) return fail("NOT_FOUND", "No pending join request found.");
  return declineJoinRequest(businessId, actor, target.id);
}

export async function listOperatorOptions(businessId: string) {
  return db.operator.findMany({
    where: { businessId, isArchived: false },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    // Dropdown source — bounded so it can never become an unbounded read.
    take: 500,
  });
}

/** True when the operator exists in THIS business (archived included). */
export async function operatorInBusiness(businessId: string, id: string) {
  return (await db.operator.count({ where: { id, businessId } })) > 0;
}
