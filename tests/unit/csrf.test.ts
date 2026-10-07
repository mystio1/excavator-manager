import { describe, expect, it } from "vitest";
import { checkCsrf } from "@/lib/csrf";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";

const req = (method: string, headers: Record<string, string> = {}) =>
  new Request("https://app.example.test/api/bills", { method, headers });

describe("checkCsrf", () => {
  it("allows safe methods without any headers", () => {
    expect(checkCsrf(req("GET"))).toEqual({ ok: true });
    expect(checkCsrf(req("HEAD"))).toEqual({ ok: true });
  });

  it("allows a POST from the app's own origin (APP_URL)", () => {
    expect(checkCsrf(req("POST", { origin: "https://app.example.test" })).ok).toBe(true);
  });

  it("allows a POST whose Origin host equals the Host header", () => {
    expect(checkCsrf(req("POST", { origin: "https://other.example", host: "other.example" })).ok).toBe(true);
  });

  it("allows the Capacitor Android origin", () => {
    expect(checkCsrf(req("POST", { origin: "https://localhost" })).ok).toBe(true);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("rejects a cross-site %s", (method) => {
    const res = checkCsrf(req(method, { origin: "https://evil.example", host: "app.example.test" }));
    expect(res.ok).toBe(false);
  });

  it("rejects an opaque 'null' origin (sandboxed iframe / data: form)", () => {
    expect(checkCsrf(req("POST", { origin: "null" })).ok).toBe(false);
  });

  it("rejects a malformed Origin", () => {
    expect(checkCsrf(req("POST", { origin: "not a url" })).ok).toBe(false);
  });

  it("without Origin, trusts only same-origin / none via Sec-Fetch-Site", () => {
    expect(checkCsrf(req("POST", { "sec-fetch-site": "same-origin" })).ok).toBe(true);
    expect(checkCsrf(req("POST", { "sec-fetch-site": "none" })).ok).toBe(true);
    expect(checkCsrf(req("POST", { "sec-fetch-site": "cross-site" })).ok).toBe(false);
    expect(checkCsrf(req("POST", { "sec-fetch-site": "same-site" })).ok).toBe(false);
  });

  it("rejects a cookie-bearing request that has neither Origin nor Sec-Fetch-Site", () => {
    expect(checkCsrf(req("POST", { cookie: "__Secure-authjs.session-token=abc" })).ok).toBe(false);
    expect(checkCsrf(req("POST", { cookie: "authjs.session-token.0=abc" })).ok).toBe(false);
  });

  it("allows a cookie-less header-less request (curl / server-to-server: nothing to forge)", () => {
    expect(checkCsrf(req("POST")).ok).toBe(true);
  });
});

describe("proxy (edge handler)", () => {
  const nreq = (method: string, headers: Record<string, string>) =>
    new NextRequest("https://app.example.test/api/bills", { method, headers });

  it("answers a cross-site POST with 403 CSRF_VALIDATION_FAILED and a request id", async () => {
    const res = proxy(nreq("POST", { origin: "https://evil.example", cookie: "__Secure-authjs.session-token=abc" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("CSRF_VALIDATION_FAILED");
    expect(typeof body.error).toBe("string");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("passes a same-origin POST through and tags it with a request id", () => {
    const res = proxy(nreq("POST", { origin: "https://app.example.test" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("answers the Android preflight with CORS headers incl. Idempotency-Key", () => {
    const res = proxy(nreq("OPTIONS", { origin: "https://localhost" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(res.headers.get("access-control-allow-headers")).toContain("Idempotency-Key");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("gives no CORS grant to other origins", () => {
    const res = proxy(nreq("OPTIONS", { origin: "https://evil.example" }));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
