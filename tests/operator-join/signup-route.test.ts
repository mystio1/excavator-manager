import { randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { POST } from "@/app/api/auth/operator-signup/route";
import { hashPart } from "@/lib/rateLimit";
import { normalizeBusinessCode } from "@/lib/utils/businessCode";
import { cleanupTenant, createTenant, fakeRequest, type TestTenant } from "../helpers/tenant";
import { uniqueMobile } from "./helpers";

/**
 * The operator-signup route is unauthenticated, so it is rate limited by IP,
 * by mobile number, by business code, and (strictly) by invalid business codes
 * per IP. These tests call the exported route handler directly. The client IP
 * is the entry TRUSTED_PROXY_HOPS positions from the RIGHT of X-Forwarded-For
 * (anything to its left is attacker-controlled).
 */

const URL = "https://app.example.test/api/auth/operator-signup";
const tenants: string[] = [];
const rateKeys: string[] = [];
let savedHops: string | undefined;

beforeAll(() => {
  savedHops = process.env.TRUSTED_PROXY_HOPS;
  process.env.TRUSTED_PROXY_HOPS = "1";
});

afterAll(async () => {
  if (savedHops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = savedHops;
  for (const id of tenants) await cleanupTenant(id);
  if (rateKeys.length) await db.rateLimitBucket.deleteMany({ where: { key: { in: rateKeys } } });
  await db.$disconnect();
});

/** IPv6 documentation-range address: effectively unique per call. */
function uniqueIp(): string {
  return `2001:db8:${randomInt(0, 65535).toString(16)}:${randomInt(0, 65535).toString(16)}:${randomInt(0, 65535).toString(16)}::1`;
}

/** Records every rate-limit key a request can create so afterAll removes them. */
function track(ip: string, mobile?: string, businessCode?: string) {
  rateKeys.push(`operator-signup:ip:${ip}`, `operator-signup:badcode:ip:${ip}`);
  if (mobile) rateKeys.push(`operator-signup:mobile:${hashPart(mobile)}`);
  if (businessCode) rateKeys.push(`operator-signup:code:${hashPart(normalizeBusinessCode(businessCode))}`);
}

function signup(ip: string, body: { businessCode: string; mobile?: string; name?: string; pin?: string }, extraXff = "6.6.6.6") {
  const mobile = body.mobile ?? uniqueMobile();
  const pin = body.pin ?? "4321";
  track(ip, mobile, body.businessCode);
  return POST(
    fakeRequest(URL, {
      headers: { "x-forwarded-for": `${extraXff}, ${ip}` },
      body: { businessCode: body.businessCode, name: body.name ?? "Route Driver", mobile, pin, confirmPin: pin },
    }),
    undefined,
  );
}

async function newTenant(label: string): Promise<TestTenant> {
  const t = await createTenant(label);
  tenants.push(t.businessId);
  return t;
}

describe("POST /api/auth/operator-signup", () => {
  it("creates a request and returns { success, message, verificationCode } (old apps read message)", async () => {
    const t = await newTenant("route-ok");
    const ip = uniqueIp();
    const mobile = uniqueMobile();
    track(ip, mobile, t.businessCode);
    const before = await db.operator.count({ where: { businessId: t.businessId } });

    const res = await signup(ip, { businessCode: t.businessCode, mobile });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body.success).toBe(true);
    expect(body.verificationCode).toMatch(/^\d{6}$/);
    expect(body.message).toContain(body.verificationCode);
    expect(await db.operator.count({ where: { businessId: t.businessId } })).toBe(before);
    expect(await db.operatorJoinRequest.count({ where: { businessId: t.businessId, mobile, status: "PENDING" } })).toBe(1);
  });

  it("reports a malformed body as 422 VALIDATION_FAILED with a string error", async () => {
    const t = await newTenant("route-validation");
    const ip = uniqueIp();
    track(ip);

    const res = await signup(ip, { businessCode: t.businessCode, pin: "12" });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(typeof body.error).toBe("string");
    expect(body.requestId).toBeTruthy();
  });

  it("registered mobile of a working operator: 409 CONFLICT, credentials untouched", async () => {
    const t = await newTenant("route-conflict");
    const ip = uniqueIp();
    const mobile = uniqueMobile();
    track(ip, mobile, t.businessCode);
    const victim = await db.operator.create({
      data: { businessId: t.businessId, name: "Victim", mobile, canLogin: true, pinHash: "$2b$10$victim.original.hash" },
    });

    const res = await signup(ip, { businessCode: t.businessCode, mobile });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
    expect(await db.operator.findUniqueOrThrow({ where: { id: victim.id } })).toEqual(victim);
  });

  it("limits each IP to 10 requests per hour: the 11th is 429 + Retry-After, even if the spoofed left part of X-Forwarded-For changes", async () => {
    const t = await newTenant("route-ip-limit");
    const ip = uniqueIp();
    track(ip, undefined, t.businessCode);

    for (let i = 0; i < 10; i++) {
      const res = await signup(ip, { businessCode: t.businessCode }, `10.0.0.${i}`); // attacker varies the left part
      expect(res.status).toBe(200);
    }
    const blocked = await signup(ip, { businessCode: t.businessCode }, "10.9.9.9");
    const body = await blocked.json();

    expect(blocked.status).toBe(429);
    expect(body.code).toBe("RATE_LIMITED");
    expect(typeof body.error).toBe("string");
    const retryAfter = Number(blocked.headers.get("retry-after"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(3600);
    // Nothing was created by the refused request.
    expect(await db.operatorJoinRequest.count({ where: { businessId: t.businessId } })).toBe(10);
  });

  it("limits each mobile number to 5 requests per hour regardless of IP", async () => {
    const t = await newTenant("route-mobile-limit");
    const mobile = uniqueMobile();

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const ip = uniqueIp();
      statuses.push((await signup(ip, { businessCode: t.businessCode, mobile })).status);
    }

    // 1st creates the request, 2nd-5th hit the duplicate-pending rule (409), the 6th is throttled.
    expect(statuses).toEqual([200, 409, 409, 409, 409, 429]);
  });

  it("limits each business code to 30 requests per hour across all IPs and mobiles", async () => {
    const t = await newTenant("route-code-limit");

    let last: Response | null = null;
    for (let i = 0; i < 31; i++) {
      const ip = uniqueIp();
      const mobile = uniqueMobile();
      last = await signup(ip, { businessCode: t.businessCode, mobile });
      if (i < 30) expect(last.status, `request ${i + 1}`).toBe(200);
    }

    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("strictly limits INVALID business codes per IP (5 per 15 min) and then refuses even a valid code", async () => {
    const t = await newTenant("route-badcode");
    const ip = uniqueIp();
    track(ip, undefined, t.businessCode);

    for (let i = 0; i < 5; i++) {
      const res = await signup(ip, { businessCode: `NOPE${i}${randomInt(1000, 9999)}` });
      expect(res.status, `invalid attempt ${i + 1}`).toBe(404);
      expect((await res.json()).code).toBe("NOT_FOUND");
    }

    // Burned allowance: a 6th invalid code is throttled...
    const sixth = await signup(ip, { businessCode: "STILLNOPE1" });
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);

    // ...and so is a VALID code, so the lockout cannot reveal which codes exist.
    const valid = await signup(ip, { businessCode: t.businessCode });
    expect(valid.status).toBe(429);
    expect(await db.operatorJoinRequest.count({ where: { businessId: t.businessId } })).toBe(0);

    // Another IP is unaffected.
    const otherIp = uniqueIp();
    expect((await signup(otherIp, { businessCode: t.businessCode })).status).toBe(200);
  });

  it("valid-code attempts never count toward the invalid-code limit", async () => {
    const t = await newTenant("route-goodcode");
    const ip = uniqueIp();
    track(ip, undefined, t.businessCode);

    for (let i = 0; i < 8; i++) {
      expect((await signup(ip, { businessCode: t.businessCode })).status).toBe(200);
    }
  });
});
