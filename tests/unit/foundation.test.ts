import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ApiHttpError, TITLE, errorResponse, failureResponse, fail, statusFor, type ErrorCode } from "@/lib/api-error";
import { withApi, parseBody } from "@/lib/with-api";
import { redact, logger } from "@/lib/logger";
import { redactForAudit } from "@/lib/audit";
import { hashRequest } from "@/lib/idempotency";
import { DEFAULT_LIMIT, LEGACY_LIMIT, MAX_LIMIT, pageArgs, parsePagination, toPage } from "@/lib/pagination";
import { appUrl, trustedOrigins } from "@/lib/config";
import { isStale } from "@/lib/tx";

const get = (url: string) => new Request(url);

describe("error contract", () => {
  it("keeps `error` a string and adds a machine-readable code", async () => {
    const res = errorResponse("RESOURCE_MODIFIED", "Changed by someone else");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Changed by someone else", code: "RESOURCE_MODIFIED" });
    expect(typeof body.error).toBe("string");
  });

  it("also carries the RFC 9457 problem-details members (additively)", async () => {
    const res = await withApi("t.problem", async () => {
      throw new ApiHttpError("PAYMENT_EXCEEDS_BALANCE", "That is more than the balance");
    })(get("http://x.test/api/t"), {});
    const body = await res.json();
    expect(body).toMatchObject({
      error: "That is more than the balance", // legacy field, still a string
      code: "PAYMENT_EXCEEDS_BALANCE",
      type: "urn:excavator:problem:payment-exceeds-balance",
      title: "Payment exceeds balance",
      status: 409,
      detail: "That is more than the balance",
    });
    expect(body.instance).toBe(`urn:request:${body.requestId}`);
    expect(res.status).toBe(409);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/); // not problem+json: old clients may sniff it
  });

  it("has a title for every error code, and the status in the body matches the HTTP status", async () => {
    for (const code of Object.keys(TITLE) as ErrorCode[]) {
      const res = errorResponse(code, "m");
      const body = await res.json();
      expect(TITLE[code].length).toBeGreaterThan(0);
      expect(body.status).toBe(res.status);
      expect(body.status).toBe(statusFor(code));
    }
  });

  it("an unreachable or saturated database is a retryable 503 with Retry-After, not a generic 500", async () => {
    const failures: Error[] = [
      new Prisma.PrismaClientKnownRequestError("Can't reach database server", { code: "P1001", clientVersion: "test" }),
      new Prisma.PrismaClientKnownRequestError("Timed out", { code: "P1008", clientVersion: "test" }),
      new Prisma.PrismaClientInitializationError("cannot start", "test"),
      new Error("timeout exceeded when trying to connect"),
      new Error("EMAXCONNSESSION max clients reached in session mode"),
      Object.assign(new Error("query failed"), { cause: new Error("connect ECONNREFUSED 127.0.0.1:5432") }),
    ];
    for (const failure of failures) {
      const res = await withApi("t.dbdown", async () => {
        throw failure;
      })(get("http://x.test/api/t"), {});
      const body = await res.json();
      expect(res.status, failure.message).toBe(503);
      expect(body.code).toBe("SERVICE_BUSY");
      expect(res.headers.get("retry-after")).toBe("5");
      expect(JSON.stringify(body)).not.toContain("ECONNREFUSED"); // no internals to the client
    }
    // an unrelated error is still a plain 500
    const other = await withApi("t.other", async () => {
      throw new Error("a genuine bug");
    })(get("http://x.test/api/t"), {});
    expect(other.status).toBe(500);
  });

  it("maps service failures (typed and legacy) to statuses", async () => {
    expect(failureResponse(fail("PAYMENT_EXCEEDS_BALANCE", "x")).status).toBe(409);
    expect(failureResponse(fail("NOT_FOUND", "x")).status).toBe(404);
    expect(failureResponse({ error: "legacy message without a code" }).status).toBe(400);
  });

  it("uses the documented status for every code", () => {
    expect(statusFor("VALIDATION_FAILED")).toBe(422);
    expect(statusFor("RATE_LIMITED")).toBe(429);
    expect(statusFor("CSRF_VALIDATION_FAILED")).toBe(403);
    expect(statusFor("ACCOUNT_FROZEN")).toBe(423);
    expect(statusFor("WORK_SESSION_ALREADY_BILLED")).toBe(409);
    expect(statusFor("IDEMPOTENCY_KEY_REUSED")).toBe(409);
  });
});

describe("withApi", () => {
  it("passes a normal response through and tags it with x-request-id", async () => {
    const handler = withApi("t.ok", async () => Response.json({ ok: true }));
    const res = await handler(get("https://x.test/api/a"), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("reuses a well-formed inbound request id and ignores a malformed one", async () => {
    const handler = withApi("t.id", async () => Response.json({}));
    const good = await handler(new Request("https://x.test/api/a", { headers: { "x-request-id": "abcd1234efgh" } }), undefined);
    expect(good.headers.get("x-request-id")).toBe("abcd1234efgh");
    const bad = await handler(new Request("https://x.test/api/a", { headers: { "x-request-id": "bad id!" } }), undefined);
    expect(bad.headers.get("x-request-id")).not.toBe("bad id!");
  });

  it("converts ApiHttpError into the contract (with custom headers)", async () => {
    const handler = withApi("t.err", async () => {
      throw new ApiHttpError("RATE_LIMITED", "slow down", { headers: { "Retry-After": "30" } });
    });
    const res = await handler(get("https://x.test/api/a"), undefined);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect((await res.json()).code).toBe("RATE_LIMITED");
  });

  it("turns a Zod failure into 422 VALIDATION_FAILED", async () => {
    const handler = withApi("t.zod", async (req) => {
      const body = await parseBody(req, z.object({ n: z.number() }));
      return Response.json(body);
    });
    const res = await handler(
      new Request("https://x.test/api/a", { method: "POST", body: JSON.stringify({ n: "nope" }) }),
      undefined,
    );
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("VALIDATION_FAILED");
  });

  it("returns 400 BAD_REQUEST for a malformed JSON body", async () => {
    const handler = withApi("t.json", async (req) => Response.json(await parseBody(req, z.object({}))));
    const res = await handler(new Request("https://x.test/api/a", { method: "POST", body: "{not json" }), undefined);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("BAD_REQUEST");
  });

  it("maps Prisma unique violations to 409 and 'not found' to 404", async () => {
    const make = (code: string) =>
      withApi("t.prisma", async () => {
        throw new Prisma.PrismaClientKnownRequestError("boom", { code, clientVersion: "test" });
      });
    expect((await make("P2002")(get("https://x.test/api/a"), undefined)).status).toBe(409);
    expect((await make("P2025")(get("https://x.test/api/a"), undefined)).status).toBe(404);
  });

  it("maps a database CHECK-constraint refusal (P2039 / pg 23514) to a plain 409, not a 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withApi("t.check", async () => {
      throw new Prisma.PrismaClientKnownRequestError("check failed", {
        code: "P2039",
        clientVersion: "test",
        meta: { driverAdapterError: { cause: { code: "23514", message: 'violates check constraint "Bill_paid_within_total"' } } },
      });
    });
    const res = await handler(get("https://x.test/api/a"), undefined);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
    expect(body.error).not.toContain("Bill_paid_within_total"); // constraint names stay in the log
    spy.mockRestore();
  });

  it("a transaction-queue timeout (P2028) is a retryable 503 with Retry-After, not a 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withApi("t.busy", async () => {
      throw new Prisma.PrismaClientKnownRequestError("Unable to start a transaction in the given time.", { code: "P2028", clientVersion: "test" });
    });
    const res = await handler(get("https://x.test/api/a"), undefined);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("2");
    expect((await res.json()).code).toBe("SERVICE_BUSY");
    spy.mockRestore();
  });

  it("rejects an oversized body with 413 — by declared length AND by counting a streamed body with no length", async () => {
    const handler = withApi("t.big", async (req) => Response.json(await parseBody(req, z.object({ s: z.string() }), { maxBytes: 1000 })));
    // 1) declared Content-Length over the cap: refused before reading anything
    const declared = await handler(
      new Request("https://x.test/api/a", { method: "POST", headers: { "content-length": "5000" }, body: JSON.stringify({ s: "x" }) }),
      undefined,
    );
    expect(declared.status).toBe(413);
    expect((await declared.json()).code).toBe("PAYLOAD_TOO_LARGE");
    // 2) no Content-Length (chunked): the stream itself is counted and cut off
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < 50; i++) c.enqueue(encoder.encode("x".repeat(100)));
        c.close();
      },
    });
    const streamed = await handler(
      new Request("https://x.test/api/a", { method: "POST", body: stream, duplex: "half" } as RequestInit),
      undefined,
    );
    expect(streamed.status).toBe(413);
    // 3) a normal body still passes
    const fine = await handler(new Request("https://x.test/api/a", { method: "POST", body: JSON.stringify({ s: "ok" }) }), undefined);
    expect(fine.status).toBe(200);
  });

  it("never leaks internals for unexpected errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withApi("t.boom", async () => {
      throw new Error("connection to db at secret-host:5432 refused, password=hunter2");
    });
    const res = await handler(get("https://x.test/api/a"), undefined);
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain("secret-host");
    expect(text).not.toContain("hunter2");
    expect(JSON.parse(text).code).toBe("INTERNAL_ERROR");
    spy.mockRestore();
  });
});

describe("logger redaction", () => {
  it("redacts sensitive keys at any depth", () => {
    const out = redact({
      email: "a@b.c",
      password: "p",
      nested: { accessToken: "t", pinHash: "h", fine: 1, authorization: "Bearer x" },
      list: [{ secretKey: "s", ok: true }],
    }) as Record<string, unknown>;
    expect(out.email).toBe("a@b.c");
    expect(out.password).toBe("[redacted]");
    expect(out.nested).toEqual({ accessToken: "[redacted]", pinHash: "[redacted]", fine: 1, authorization: "[redacted]" });
    expect(out.list).toEqual([{ secretKey: "[redacted]", ok: true }]);
  });

  it("emits one JSON line per entry without secrets", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "error";
    logger.error("failed", new Error("boom"), { token: "abc", route: "/x" });
    const line = String(spy.mock.calls[0]?.[0]);
    expect(() => JSON.parse(line)).not.toThrow();
    expect(line).not.toContain("abc");
    expect(JSON.parse(line).msg).toBe("failed");
    spy.mockRestore();
  });
});

describe("audit snapshots", () => {
  it("keeps Decimals exact as strings, dates as ISO, and strips credentials", () => {
    const snap = redactForAudit({
      amount: new Prisma.Decimal("1234.50"),
      when: new Date("2026-10-04T00:00:00.000Z"),
      passwordHash: "x",
      pinHash: "y",
      resetTokenHash: "z",
      nested: { appPinHash: "q", name: "ok" },
    });
    expect(snap).toEqual({ amount: "1234.5", when: "2026-10-04T00:00:00.000Z", nested: { name: "ok" } });
  });
});

describe("idempotency request hash", () => {
  it("is stable under key order and sensitive to content/operation", () => {
    expect(hashRequest("bill.create", { a: 1, b: { x: 1, y: 2 } })).toBe(hashRequest("bill.create", { b: { y: 2, x: 1 }, a: 1 }));
    expect(hashRequest("bill.create", { a: 1 })).not.toBe(hashRequest("bill.create", { a: 2 }));
    expect(hashRequest("bill.create", { a: 1 })).not.toBe(hashRequest("payment.create", { a: 1 }));
  });
});

describe("pagination", () => {
  it("applies a bounded legacy page when no limit is sent (old apps)", () => {
    expect(parsePagination(get("https://x.test/api/bills")).limit).toBe(LEGACY_LIMIT);
  });
  it("honours and clamps an explicit limit; rejects garbage", () => {
    expect(parsePagination(get("https://x.test/api/bills?limit=25")).limit).toBe(25);
    expect(parsePagination(get(`https://x.test/api/bills?limit=${MAX_LIMIT * 10}`)).limit).toBe(MAX_LIMIT);
    expect(() => parsePagination(get("https://x.test/api/bills?limit=0"))).toThrow(ApiHttpError);
    expect(() => parsePagination(get("https://x.test/api/bills?limit=abc"))).toThrow(ApiHttpError);
    expect(DEFAULT_LIMIT).toBeLessThanOrEqual(MAX_LIMIT);
  });
  it("fetches one extra row and derives nextCursor", () => {
    expect(pageArgs({ limit: 10, cursor: undefined })).toEqual({ take: 11 });
    expect(pageArgs({ limit: 10, cursor: "abc" })).toEqual({ take: 11, cursor: { id: "abc" }, skip: 1 });
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: `id${i}` }));
    expect(toPage(rows, 10)).toEqual({ items: rows.slice(0, 10), nextCursor: "id9" });
    expect(toPage(rows.slice(0, 5), 10)).toEqual({ items: rows.slice(0, 5), nextCursor: null });
  });
});

describe("config & concurrency helpers", () => {
  it("trusts the app URL and the Android origin, nothing else", () => {
    const origins = trustedOrigins();
    expect(origins.has("https://localhost")).toBe(true);
    expect(origins.has(appUrl())).toBe(true);
    expect(origins.has("https://evil.example")).toBe(false);
  });
  it("detects a stale version only when the client sent one", () => {
    expect(isStale(3, 3)).toBe(false);
    expect(isStale(4, 3)).toBe(true);
    expect(isStale(4, undefined)).toBe(false);
    expect(isStale(4, null)).toBe(false);
  });
});
