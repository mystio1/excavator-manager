import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  MAX_JOIN_CODE_ATTEMPTS,
  approveJoinRequest,
  approveJoinRequestLegacy,
  declineJoinRequest,
  declineJoinRequestLegacy,
  listPendingJoinRequests,
} from "@/lib/services/operators";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { fileJoinRequest, uniqueMobile, wrongCode } from "./helpers";

/**
 * Approval is the only thing that turns a join request into working
 * credentials, and it needs the one-time verification code the requester saw.
 */

let t: TestTenant;
let other: TestTenant; // a second business: cross-tenant attempts
const tenants: string[] = [];

beforeAll(async () => {
  t = await createTenant("join-approve");
  other = await createTenant("join-approve-other");
  tenants.push(t.businessId, other.businessId);
});

afterAll(async () => {
  for (const id of tenants) await cleanupTenant(id);
  await db.$disconnect();
});

const auditRows = (businessId: string, action: string, entityId?: string) =>
  db.auditLog.findMany({ where: { businessId, action, ...(entityId ? { entityId } : {}) } });

/** A pre-redesign request: no verification code, optionally linked to an operator. */
async function legacyRequest(businessId: string, opts: { mobile?: string; operatorId?: string | null; name?: string } = {}) {
  return db.operatorJoinRequest.create({
    data: {
      businessId,
      name: opts.name ?? "Legacy Name",
      mobile: opts.mobile ?? uniqueMobile(),
      pinHash: await hashPassword("2468"),
      verificationHash: "",
      operatorId: opts.operatorId ?? null,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
}

describe("approveJoinRequest: verification code", () => {
  it("approves with the right code: creates the operator with the requested PIN, consumes the request, audits", async () => {
    const { requestId, code, mobile } = await fileJoinRequest(t, { name: "Fresh Driver", pin: "13579" });

    const result = await approveJoinRequest(t.businessId, t.actor, requestId, code);
    if ("error" in result) throw new Error(result.error);
    expect(result.createdOperator).toBe(true);

    const operator = await db.operator.findUniqueOrThrow({ where: { id: result.operator.id } });
    expect(operator).toMatchObject({ businessId: t.businessId, name: "Fresh Driver", mobile, canLogin: true, isArchived: false });
    expect(operator.pinHash).not.toBeNull();
    expect(await verifyPassword("13579", operator.pinHash ?? "")).toBe(true);

    const request = await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request).toMatchObject({ status: "APPROVED", decidedBy: t.actor.id, operatorId: operator.id });
    expect(request.decidedAt).not.toBeNull();

    const [approve] = await auditRows(t.businessId, "operator.join.approve", requestId);
    expect(approve).toBeDefined();
    expect(approve.actorType).toBe("OWNER");
    expect(approve.actorId).toBe(t.actor.id);
    expect(approve.entityType).toBe("OperatorJoinRequest");
    expect(await auditRows(t.businessId, "operator.create", operator.id)).toHaveLength(1);
  });

  it("never writes a PIN hash or verification hash into the audit trail", async () => {
    const { requestId, code, request } = await fileJoinRequest(t);
    const result = await approveJoinRequest(t.businessId, t.actor, requestId, code);
    expect("error" in result).toBe(false);

    const rows = await db.auditLog.findMany({ where: { businessId: t.businessId, entityId: requestId } });
    expect(rows.length).toBeGreaterThan(0);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(request.pinHash);
    expect(dump).not.toContain(request.verificationHash);
    expect(dump).not.toMatch(/pinHash|verificationHash/i);
  });

  it("refuses a wrong code, counts the attempt, and changes nothing else", async () => {
    const { requestId, code, mobile } = await fileJoinRequest(t);
    const before = await db.operator.count({ where: { businessId: t.businessId } });

    const result = await approveJoinRequest(t.businessId, t.actor, requestId, wrongCode(code));

    expect(result).toMatchObject({ code: "VALIDATION_FAILED" });
    expect("error" in result && result.error).toMatch(/wrong verification code.*4 attempts left/i);
    const request = await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("PENDING");
    expect(request.verifyAttempts).toBe(1);
    expect(await db.operator.count({ where: { businessId: t.businessId } })).toBe(before);
    expect(await db.operator.count({ where: { businessId: t.businessId, mobile } })).toBe(0);

    // The right code still works afterwards.
    const ok = await approveJoinRequest(t.businessId, t.actor, requestId, code);
    expect("error" in ok).toBe(false);
  });

  it("refuses a missing or malformed code without burning an attempt", async () => {
    const { requestId, code } = await fileJoinRequest(t);

    for (const bad of [undefined, "", "12345", "1234567", "12ab56", " "]) {
      const r = await approveJoinRequest(t.businessId, t.actor, requestId, bad);
      expect(r).toMatchObject({ code: "VALIDATION_FAILED" });
    }
    const request = await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.verifyAttempts).toBe(0);
    expect(request.status).toBe("PENDING");
    expect("error" in (await approveJoinRequest(t.businessId, t.actor, requestId, code))).toBe(false);
  });

  it("locks the request after 5 wrong codes: even the right code is then refused", async () => {
    const { requestId, code } = await fileJoinRequest(t);
    const bad = wrongCode(code);

    for (let i = 1; i < MAX_JOIN_CODE_ATTEMPTS; i++) {
      const r = await approveJoinRequest(t.businessId, t.actor, requestId, bad);
      expect(r).toMatchObject({ code: "VALIDATION_FAILED" });
    }
    const last = await approveJoinRequest(t.businessId, t.actor, requestId, bad);
    expect(last).toMatchObject({ code: "CONFLICT" });
    expect("error" in last && last.error).toMatch(/locked/i);

    const request = await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("LOCKED");
    expect(request.verifyAttempts).toBe(MAX_JOIN_CODE_ATTEMPTS);

    const afterLock = await approveJoinRequest(t.businessId, t.actor, requestId, code);
    expect(afterLock).toMatchObject({ code: "CONFLICT" });
    expect(await db.operator.count({ where: { businessId: t.businessId, mobile: request.mobile } })).toBe(0);

    expect(await auditRows(t.businessId, "operator.join.locked", requestId)).toHaveLength(1);
    // A locked request no longer shows up as pending.
    expect((await listPendingJoinRequests(t.businessId)).some((r) => r.id === requestId)).toBe(false);
  });

  it("serializes concurrent wrong guesses: exactly 5 are counted, then it is locked", async () => {
    const { requestId, code } = await fileJoinRequest(t);
    const bad = wrongCode(code);

    const results = await Promise.all(Array.from({ length: 6 }, () => approveJoinRequest(t.businessId, t.actor, requestId, bad)));

    const request = await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("LOCKED");
    expect(request.verifyAttempts).toBe(MAX_JOIN_CODE_ATTEMPTS);
    expect(results.every((r) => "error" in r)).toBe(true);
    expect(await auditRows(t.businessId, "operator.join.locked", requestId)).toHaveLength(1);
  });

  it("cannot be replayed: a second approval fails and creates no second operator", async () => {
    const { requestId, code, mobile } = await fileJoinRequest(t);
    const first = await approveJoinRequest(t.businessId, t.actor, requestId, code);
    expect("error" in first).toBe(false);

    const replay = await approveJoinRequest(t.businessId, t.actor, requestId, code);
    expect(replay).toMatchObject({ code: "CONFLICT", error: "This request was already approved." });
    expect(await db.operator.count({ where: { businessId: t.businessId, mobile } })).toBe(1);
    expect(await auditRows(t.businessId, "operator.join.approve", requestId)).toHaveLength(1);
  });

  it("lets only one of several simultaneous correct approvals through", async () => {
    const { requestId, code, mobile } = await fileJoinRequest(t);

    const results = await Promise.all([0, 1, 2, 3].map(() => approveJoinRequest(t.businessId, t.actor, requestId, code)));

    expect(results.filter((r) => !("error" in r))).toHaveLength(1);
    expect(results.filter((r) => "error" in r && r.code === "CONFLICT")).toHaveLength(3);
    expect(await db.operator.count({ where: { businessId: t.businessId, mobile } })).toBe(1);
  });

  it("cannot approve an expired request, and flips it to EXPIRED", async () => {
    const { requestId, code } = await fileJoinRequest(t);
    await db.operatorJoinRequest.update({ where: { id: requestId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const result = await approveJoinRequest(t.businessId, t.actor, requestId, code);

    expect(result).toMatchObject({ code: "CONFLICT" });
    expect("error" in result && result.error).toMatch(/expired/i);
    const request = await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("EXPIRED");
    expect(await db.operator.count({ where: { businessId: t.businessId, mobile: request.mobile } })).toBe(0);
  });

  it("respects the business's maxOperators cap and leaves the request approvable", async () => {
    const capped = await createTenant("join-approve-cap");
    tenants.push(capped.businessId);
    await db.business.update({ where: { id: capped.businessId }, data: { maxOperators: 1 } }); // the tenant already has 1
    const { requestId, code, mobile } = await fileJoinRequest(capped);

    const blocked = await approveJoinRequest(capped.businessId, capped.actor, requestId, code);
    expect(blocked).toMatchObject({ code: "CONFLICT" });
    expect("error" in blocked && blocked.error).toMatch(/limit of 1 operators/);
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("PENDING");
    expect(await db.operator.count({ where: { businessId: capped.businessId, mobile } })).toBe(0);

    await db.business.update({ where: { id: capped.businessId }, data: { maxOperators: 2 } });
    expect("error" in (await approveJoinRequest(capped.businessId, capped.actor, requestId, code))).toBe(false);
  });
});

describe("approveJoinRequest: linking an existing operator", () => {
  it("attaches the PIN to the linked operator (no rename, no duplicate) and bumps tokenVersion", async () => {
    const operator = await db.operator.create({
      data: { businessId: t.businessId, name: "Admin's Name For Him", mobile: uniqueMobile(), defaultMonthlySalary: "18000.50" },
    });
    const { requestId, code, request } = await fileJoinRequest(t, { mobile: operator.mobile, name: "Typed By Requester", pin: "8642" });
    expect(request.operatorId).toBe(operator.id);

    const result = await approveJoinRequest(t.businessId, t.actor, requestId, code);
    if ("error" in result) throw new Error(result.error);
    expect(result.createdOperator).toBe(false);
    expect(result.operator.id).toBe(operator.id);

    const after = await db.operator.findUniqueOrThrow({ where: { id: operator.id } });
    expect(after.name).toBe("Admin's Name For Him");
    expect(after.canLogin).toBe(true);
    expect(await verifyPassword("8642", after.pinHash ?? "")).toBe(true);
    expect(after.tokenVersion).toBe(operator.tokenVersion + 1);
    expect(after.version).toBe(operator.version + 1);
    expect(after.defaultMonthlySalary.toString()).toBe("18000.5");
    expect(await db.operator.count({ where: { businessId: t.businessId, mobile: operator.mobile } })).toBe(1);
    expect(await auditRows(t.businessId, "operator.login.enable", operator.id)).toHaveLength(1);
  });

  it("refuses when the linked operator got working credentials after the request was filed", async () => {
    const operator = await db.operator.create({ data: { businessId: t.businessId, name: "Late", mobile: uniqueMobile() } });
    const { requestId, code } = await fileJoinRequest(t, { mobile: operator.mobile });
    const existingHash = await hashPassword("5555");
    await db.operator.update({ where: { id: operator.id }, data: { canLogin: true, pinHash: existingHash } });

    const result = await approveJoinRequest(t.businessId, t.actor, requestId, code);

    expect(result).toMatchObject({ code: "CONFLICT" });
    const after = await db.operator.findUniqueOrThrow({ where: { id: operator.id } });
    expect(after.pinHash).toBe(existingHash);
    expect(after.tokenVersion).toBe(operator.tokenVersion);
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("PENDING");
  });

  it("refuses when the linked operator has been archived meanwhile", async () => {
    const operator = await db.operator.create({ data: { businessId: t.businessId, name: "Archived Soon", mobile: uniqueMobile() } });
    const { requestId, code } = await fileJoinRequest(t, { mobile: operator.mobile });
    await db.operator.update({ where: { id: operator.id }, data: { isArchived: true } });

    const result = await approveJoinRequest(t.businessId, t.actor, requestId, code);

    expect(result).toMatchObject({ code: "CONFLICT" });
    expect((await db.operator.findUniqueOrThrow({ where: { id: operator.id } })).pinHash).toBeNull();
  });

  it("picks up an operator the admin added AFTER the request was filed", async () => {
    const { requestId, code, mobile } = await fileJoinRequest(t, { name: "Typed Name" });
    const added = await db.operator.create({ data: { businessId: t.businessId, name: "Added Later", mobile } });

    const result = await approveJoinRequest(t.businessId, t.actor, requestId, code);
    if ("error" in result) throw new Error(result.error);

    expect(result.createdOperator).toBe(false);
    expect(result.operator.id).toBe(added.id);
    expect(await db.operator.count({ where: { businessId: t.businessId, mobile } })).toBe(1);
  });

  it("legacy request (no code) approves without one and links the existing operator", async () => {
    const operator = await db.operator.create({ data: { businessId: t.businessId, name: "Old Flow Operator", mobile: uniqueMobile() } });
    const legacy = await legacyRequest(t.businessId, { mobile: operator.mobile, operatorId: operator.id });

    const result = await approveJoinRequest(t.businessId, t.actor, legacy.id);
    if ("error" in result) throw new Error(result.error);

    expect(result.createdOperator).toBe(false);
    const after = await db.operator.findUniqueOrThrow({ where: { id: operator.id } });
    expect(after.canLogin).toBe(true);
    expect(await verifyPassword("2468", after.pinHash ?? "")).toBe(true);
    expect(after.tokenVersion).toBe(operator.tokenVersion + 1);
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: legacy.id } })).status).toBe("APPROVED");
  });
});

describe("tenant isolation", () => {
  it("cannot approve another business's request: NOT_FOUND, request untouched", async () => {
    const { requestId, code, mobile } = await fileJoinRequest(t);

    const result = await approveJoinRequest(other.businessId, other.actor, requestId, code);

    expect(result).toMatchObject({ code: "NOT_FOUND" });
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("PENDING");
    expect(await db.operator.count({ where: { businessId: other.businessId, mobile } })).toBe(0);
    expect(await db.operator.count({ where: { businessId: t.businessId, mobile } })).toBe(0);
  });

  it("cannot decline another business's request either, nor see it in the pending list", async () => {
    const { requestId } = await fileJoinRequest(t);

    expect(await declineJoinRequest(other.businessId, other.actor, requestId)).toMatchObject({ code: "NOT_FOUND" });
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("PENDING");
    expect((await listPendingJoinRequests(other.businessId)).some((r) => r.id === requestId)).toBe(false);
    expect((await listPendingJoinRequests(t.businessId)).some((r) => r.id === requestId)).toBe(true);
  });

  it("the legacy operator-id endpoints are tenant-scoped too", async () => {
    const operator = await db.operator.create({ data: { businessId: t.businessId, name: "Scoped", mobile: uniqueMobile() } });
    const legacy = await legacyRequest(t.businessId, { mobile: operator.mobile, operatorId: operator.id });

    expect(await approveJoinRequestLegacy(other.businessId, other.actor, operator.id)).toMatchObject({ code: "NOT_FOUND" });
    expect(await declineJoinRequestLegacy(other.businessId, other.actor, legacy.id)).toMatchObject({ code: "NOT_FOUND" });
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: legacy.id } })).status).toBe("PENDING");
  });
});

describe("declineJoinRequest", () => {
  it("rejects the request, writes an audit row, and cannot then be approved or declined again", async () => {
    const { requestId, code, mobile } = await fileJoinRequest(t);

    const result = await declineJoinRequest(t.businessId, t.actor, requestId);
    expect(result).toEqual({ ok: true });

    const request = await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request).toMatchObject({ status: "REJECTED", decidedBy: t.actor.id });
    expect(request.decidedAt).not.toBeNull();
    const [row] = await auditRows(t.businessId, "operator.join.reject", requestId);
    expect(row).toBeDefined();
    expect(row.actorId).toBe(t.actor.id);

    expect(await approveJoinRequest(t.businessId, t.actor, requestId, code)).toMatchObject({ code: "CONFLICT" });
    expect(await declineJoinRequest(t.businessId, t.actor, requestId)).toMatchObject({ code: "CONFLICT" });
    expect(await db.operator.count({ where: { businessId: t.businessId, mobile } })).toBe(0);
  });

  it("a declined number can file a new request again", async () => {
    const { requestId, mobile } = await fileJoinRequest(t);
    await declineJoinRequest(t.businessId, t.actor, requestId);

    const again = await fileJoinRequest(t, { mobile });
    expect(again.requestId).not.toBe(requestId);
  });
});

describe("listPendingJoinRequests", () => {
  it("returns pending, unexpired requests with requiresCode/linkedOperator and never a hash", async () => {
    const operator = await db.operator.create({ data: { businessId: t.businessId, name: "Linked Op", mobile: uniqueMobile() } });
    const coded = await fileJoinRequest(t, { mobile: operator.mobile, name: "Coded Person" });
    const legacy = await legacyRequest(t.businessId, { name: "Legacy Person" });
    const expired = await fileJoinRequest(t, { name: "Expired Person" });
    await db.operatorJoinRequest.update({ where: { id: expired.requestId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const declined = await fileJoinRequest(t, { name: "Declined Person" });
    await declineJoinRequest(t.businessId, t.actor, declined.requestId);

    const list = await listPendingJoinRequests(t.businessId);

    const byId = new Map(list.map((r) => [r.id, r]));
    expect(byId.get(coded.requestId)).toMatchObject({
      name: "Coded Person",
      mobile: operator.mobile,
      requiresCode: true,
      linkedOperator: { id: operator.id, name: "Linked Op" },
    });
    expect(byId.get(legacy.id)).toMatchObject({ name: "Legacy Person", requiresCode: false });
    expect(byId.get(legacy.id)?.linkedOperator).toBeUndefined();
    expect(byId.has(expired.requestId)).toBe(false);
    expect(byId.has(declined.requestId)).toBe(false);
    for (const row of list) {
      expect(Object.keys(row).sort()).toEqual(
        ["createdAt", "expiresAt", "id", "mobile", "name", "requiresCode", ...(row.linkedOperator ? ["linkedOperator"] : [])].sort(),
      );
    }
    expect(JSON.stringify(list)).not.toMatch(/pinHash|verificationHash|\$2[aby]\$/);

    // Housekeeping: the lapsed request was flipped.
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: expired.requestId } })).status).toBe("EXPIRED");
  });
});

describe("legacy operator-id endpoints", () => {
  it("approve a code-less request addressed by OPERATOR id", async () => {
    const operator = await db.operator.create({ data: { businessId: t.businessId, name: "By Op Id", mobile: uniqueMobile() } });
    const legacy = await legacyRequest(t.businessId, { mobile: operator.mobile, operatorId: operator.id });

    const result = await approveJoinRequestLegacy(t.businessId, t.actor, operator.id);

    expect("error" in result).toBe(false);
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: legacy.id } })).status).toBe("APPROVED");
    expect((await db.operator.findUniqueOrThrow({ where: { id: operator.id } })).canLogin).toBe(true);
  });

  it("also accept a request id", async () => {
    const legacy = await legacyRequest(t.businessId);
    expect("error" in (await approveJoinRequestLegacy(t.businessId, t.actor, legacy.id))).toBe(false);
  });

  it("cannot approve a coded request: 409 telling the admin to update the app", async () => {
    const operator = await db.operator.create({ data: { businessId: t.businessId, name: "Coded Via Old UI", mobile: uniqueMobile() } });
    const { requestId } = await fileJoinRequest(t, { mobile: operator.mobile });

    const result = await approveJoinRequestLegacy(t.businessId, t.actor, operator.id);

    expect(result).toMatchObject({ code: "CONFLICT" });
    expect("error" in result && result.error).toMatch(/update the app|web app/i);
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("PENDING");
    expect((await db.operator.findUniqueOrThrow({ where: { id: operator.id } })).pinHash).toBeNull();
  });

  it("decline a pending request addressed by operator id (coded or not)", async () => {
    const operator = await db.operator.create({ data: { businessId: t.businessId, name: "Decline Me", mobile: uniqueMobile() } });
    const { requestId } = await fileJoinRequest(t, { mobile: operator.mobile });

    expect(await declineJoinRequestLegacy(t.businessId, t.actor, operator.id)).toEqual({ ok: true });
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("REJECTED");
  });

  it("answer NOT_FOUND when nothing is pending", async () => {
    expect(await approveJoinRequestLegacy(t.businessId, t.actor, t.operatorId)).toMatchObject({ code: "NOT_FOUND" });
    expect(await declineJoinRequestLegacy(t.businessId, t.actor, t.operatorId)).toMatchObject({ code: "NOT_FOUND" });
  });
});
