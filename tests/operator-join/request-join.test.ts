import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { hashJoinCode, requestOperatorJoin } from "@/lib/services/operators";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { fileJoinRequest, uniqueMobile } from "./helpers";

/**
 * SECURITY REGRESSION: knowing a business code + an operator's mobile number
 * used to let an unauthenticated visitor set (or overwrite) that operator's PIN.
 * requestOperatorJoin must now ONLY ever create an OperatorJoinRequest.
 */

let t: TestTenant;
const tenants: string[] = [];

beforeAll(async () => {
  t = await createTenant("join-request");
  tenants.push(t.businessId);
});

afterAll(async () => {
  for (const id of tenants) await cleanupTenant(id);
  await db.$disconnect();
});

const operatorCount = (businessId: string) => db.operator.count({ where: { businessId } });

describe("requestOperatorJoin", () => {
  it("creates a PENDING request, never an Operator row, and returns the code once", async () => {
    const before = await operatorCount(t.businessId);
    const mobile = uniqueMobile();

    const result = await requestOperatorJoin(t.businessCode, "  Ravi Kumar ", ` ${mobile} `, "482915");
    if ("error" in result) throw new Error(result.error);

    expect(await operatorCount(t.businessId)).toBe(before);
    expect(result.verificationCode).toMatch(/^\d{6}$/);
    expect(result.message).toBe(
      `Request submitted! Your verification code is ${result.verificationCode} - give it to your admin, who needs it to approve you.`,
    );

    const request = await db.operatorJoinRequest.findFirstOrThrow({ where: { businessId: t.businessId, mobile } });
    expect(request.status).toBe("PENDING");
    expect(request.name).toBe("Ravi Kumar");
    expect(request.operatorId).toBeNull();
    expect(request.verifyAttempts).toBe(0);
    const days = (request.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("stores only hashes: bcrypt for the PIN, HMAC for the code", async () => {
    const { request, code } = await fileJoinRequest(t, { pin: "73519" });
    expect(request.pinHash).not.toContain("73519");
    expect(await verifyPassword("73519", request.pinHash)).toBe(true);
    expect(request.verificationHash).toMatch(/^[0-9a-f]{64}$/);
    expect(request.verificationHash).not.toBe(code);
    expect(request.verificationHash).toBe(hashJoinCode(request.id, code));
    // bound to the request id: the same code hashes differently elsewhere
    expect(hashJoinCode("another-request", code)).not.toBe(request.verificationHash);
  });

  it("does NOT modify an existing operator without credentials; it only links the request", async () => {
    const operator = await db.operator.create({
      data: { businessId: t.businessId, name: "Existing Driver", mobile: uniqueMobile() },
    });
    const { request } = await fileJoinRequest(t, { mobile: operator.mobile, name: "Someone Else", pin: "9999" });

    const after = await db.operator.findUniqueOrThrow({ where: { id: operator.id } });
    expect(after).toEqual(operator); // byte-for-byte: no PIN, no canLogin, no name, no version bump
    expect(after.pinHash).toBeNull();
    expect(after.canLogin).toBe(false);
    expect(request.operatorId).toBe(operator.id);
  });

  it("cannot overwrite credentials of an operator that already has a working login", async () => {
    const mobile = uniqueMobile();
    const victim = await db.operator.create({
      data: { businessId: t.businessId, name: "Victim", mobile, canLogin: true, pinHash: "$2b$10$victim.original.hash.value" },
    });

    const result = await requestOperatorJoin(t.businessCode, "Attacker", mobile, "1111");

    expect(result).toEqual({ error: "This mobile number is already registered — log in instead.", code: "CONFLICT" });
    const after = await db.operator.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after).toEqual(victim);
    expect(await db.operatorJoinRequest.count({ where: { businessId: t.businessId, mobile } })).toBe(0);
  });

  it("an admin-enabled operator with no PIN yet is linked but still untouched", async () => {
    const operator = await db.operator.create({
      data: { businessId: t.businessId, name: "Enabled No Pin", mobile: uniqueMobile(), canLogin: true },
    });
    const { request } = await fileJoinRequest(t, { mobile: operator.mobile });
    expect(request.operatorId).toBe(operator.id);
    expect(await db.operator.findUniqueOrThrow({ where: { id: operator.id } })).toEqual(operator);
  });

  it("ignores archived operators when matching", async () => {
    const operator = await db.operator.create({
      data: { businessId: t.businessId, name: "Gone", mobile: uniqueMobile(), isArchived: true, canLogin: true, pinHash: "x" },
    });
    const { request } = await fileJoinRequest(t, { mobile: operator.mobile });
    expect(request.operatorId).toBeNull();
  });

  it("refuses a second pending request for the same number and keeps the first intact", async () => {
    const first = await fileJoinRequest(t);

    const second = await requestOperatorJoin(t.businessCode, "Impostor", first.mobile, "7777");
    expect(second).toEqual({
      error: "A request for this number is already waiting for approval - ask your admin.",
      code: "CONFLICT",
    });

    const rows = await db.operatorJoinRequest.findMany({ where: { businessId: t.businessId, mobile: first.mobile } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(first.request); // not overwritten: same name, same PIN hash, same code hash
  });

  it("allows a new request once the previous one has expired", async () => {
    const first = await fileJoinRequest(t);
    await db.operatorJoinRequest.update({ where: { id: first.requestId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const again = await requestOperatorJoin(t.businessCode, "Retry", first.mobile, "2468");
    expect("error" in again).toBe(false);
    expect((await db.operatorJoinRequest.findUniqueOrThrow({ where: { id: first.requestId } })).status).toBe("EXPIRED");
  });

  it("rejects an invalid business code with NOT_FOUND and creates nothing", async () => {
    const mobile = uniqueMobile();
    const result = await requestOperatorJoin("NOPE-NOT-A-CODE", "X", mobile, "1234");
    expect(result).toMatchObject({ code: "NOT_FOUND" });
    expect(await db.operatorJoinRequest.count({ where: { mobile } })).toBe(0);
  });

  it("matches the business code case-insensitively", async () => {
    const result = await requestOperatorJoin(t.businessCode.toLowerCase(), "Lower", uniqueMobile(), "1234");
    expect("error" in result).toBe(false);
  });

  it("allows only one of several simultaneous requests for the same number", async () => {
    const mobile = uniqueMobile();
    const results = await Promise.all(
      [0, 1, 2, 3].map((i) => requestOperatorJoin(t.businessCode, `Racer ${i}`, mobile, "1234")),
    );
    expect(results.filter((r) => !("error" in r))).toHaveLength(1);
    expect(results.filter((r) => "error" in r && r.code === "CONFLICT")).toHaveLength(3);
    expect(await db.operatorJoinRequest.count({ where: { businessId: t.businessId, mobile, status: "PENDING" } })).toBe(1);
  });
});

describe("pending-request cap", () => {
  it("allows at most 50 pending requests per business; expired ones do not count", async () => {
    const capTenant = await createTenant("join-cap");
    tenants.push(capTenant.businessId);
    const future = new Date(Date.now() + 86_400_000);
    await db.operatorJoinRequest.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        businessId: capTenant.businessId,
        name: `Bulk ${i}`,
        mobile: `8${String(i).padStart(9, "0")}`,
        pinHash: "x",
        verificationHash: "",
        expiresAt: future,
      })),
    });

    const blocked = await requestOperatorJoin(capTenant.businessCode, "Number 51", uniqueMobile(), "1234");
    expect(blocked).toMatchObject({ code: "CONFLICT" });
    expect("error" in blocked && blocked.error).toMatch(/too many join requests/i);

    // One lapses -> a slot frees up.
    await db.operatorJoinRequest.updateMany({
      where: { businessId: capTenant.businessId, mobile: "8000000000" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const ok = await requestOperatorJoin(capTenant.businessCode, "Number 51", uniqueMobile(), "1234");
    expect("error" in ok).toBe(false);
  });
});
