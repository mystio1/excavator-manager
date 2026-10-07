import { afterEach, describe, expect, it, vi } from "vitest";
import { hashJoinCode } from "@/lib/services/operators";

/**
 * Operator join codes are keyed by JOIN_CODE_SECRET (falling back to AUTH_SECRET), so the session key and the
 * join-code key can be leaked or rotated independently. config-check.test.ts covers the WARNINGS; this proves
 * the HMAC really uses the key it claims to.
 */
const REQUEST = "req-123";
const CODE = "482913";

afterEach(() => vi.unstubAllEnvs());

describe("hashJoinCode key separation", () => {
  it("uses JOIN_CODE_SECRET when it is set: changing AUTH_SECRET no longer changes the hash", () => {
    vi.stubEnv("JOIN_CODE_SECRET", "join-secret-one-0123456789abcdef");
    vi.stubEnv("AUTH_SECRET", "auth-secret-one-0123456789abcdef");
    const before = hashJoinCode(REQUEST, CODE);
    vi.stubEnv("AUTH_SECRET", "auth-secret-two-0123456789abcdef");
    expect(hashJoinCode(REQUEST, CODE)).toBe(before);
  });

  it("changing JOIN_CODE_SECRET does change the hash (the key is really in use)", () => {
    vi.stubEnv("AUTH_SECRET", "auth-secret-one-0123456789abcdef");
    vi.stubEnv("JOIN_CODE_SECRET", "join-secret-one-0123456789abcdef");
    const one = hashJoinCode(REQUEST, CODE);
    vi.stubEnv("JOIN_CODE_SECRET", "join-secret-two-0123456789abcdef");
    expect(hashJoinCode(REQUEST, CODE)).not.toBe(one);
  });

  it("falls back to AUTH_SECRET when JOIN_CODE_SECRET is unset (existing deployments keep working)", () => {
    vi.stubEnv("JOIN_CODE_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "auth-secret-one-0123456789abcdef");
    const withFallback = hashJoinCode(REQUEST, CODE);
    vi.stubEnv("JOIN_CODE_SECRET", "auth-secret-one-0123456789abcdef"); // same value as the fallback key
    expect(hashJoinCode(REQUEST, CODE)).toBe(withFallback);
    vi.stubEnv("AUTH_SECRET", "auth-secret-two-0123456789abcdef");
    vi.stubEnv("JOIN_CODE_SECRET", "");
    expect(hashJoinCode(REQUEST, CODE)).not.toBe(withFallback); // and rotating AUTH_SECRET then DOES invalidate codes
  });

  it("is bound to the request id and to the code, and refuses to run with no key at all", () => {
    vi.stubEnv("JOIN_CODE_SECRET", "join-secret-one-0123456789abcdef");
    expect(hashJoinCode("req-A", CODE)).not.toBe(hashJoinCode("req-B", CODE));
    expect(hashJoinCode(REQUEST, "111111")).not.toBe(hashJoinCode(REQUEST, "222222"));
    vi.stubEnv("JOIN_CODE_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => hashJoinCode(REQUEST, CODE)).toThrow(/JOIN_CODE_SECRET/);
  });
});
