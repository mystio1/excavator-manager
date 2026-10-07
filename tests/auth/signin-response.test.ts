import { describe, expect, it } from "vitest";
import { signInFailureResponse } from "@/lib/signin-response";

const authError = (type: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(type), { type, ...extra });

describe("signInFailureResponse", () => {
  it("a genuine credentials failure is the one generic 401 (no hint which part was wrong)", async () => {
    const res = signInFailureResponse(authError("CredentialsSignin", { code: "credentials" }), "Wrong email/phone or password");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED", error: "Wrong email/phone or password" });
  });

  it("a throttle refusal is 429 with Retry-After", async () => {
    const res = signInFailureResponse(authError("CredentialsSignin", { code: "rate_limited", retryAfterSec: 120 }), "x");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
  });

  it("a frozen account is 423 and keeps the legacy `frozen` flag older apps read", async () => {
    const res = signInFailureResponse(authError("CredentialsSignin", { code: "account_frozen" }), "x");
    expect(res.status).toBe(423);
    expect(await res.json()).toMatchObject({ code: "ACCOUNT_FROZEN", frozen: true });
  });

  it("a server problem wrapped by Auth.js (database down inside authorize) is NOT reported as a wrong password", () => {
    expect(() => signInFailureResponse(authError("CallbackRouteError"), "Wrong email/phone or password")).toThrow();
  });
});
