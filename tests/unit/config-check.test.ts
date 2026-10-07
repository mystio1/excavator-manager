import { describe, expect, it } from "vitest";
import { checkConfig } from "@/lib/config-check";

const GOOD = {
  DATABASE_URL: "postgresql://u:p@host:5432/db",
  AUTH_SECRET: "a".repeat(44),
  APP_URL: "https://example.test",
  JOIN_CODE_SECRET: "b".repeat(44),
  RESEND_API_KEY: "re_x",
  RESEND_FROM_EMAIL: "Excavator <no-reply@example.test>",
};

describe("checkConfig", () => {
  it("accepts a complete production configuration with no findings", () => {
    expect(checkConfig(GOOD, true)).toEqual({ errors: [], warnings: [] });
  });

  it("reports missing required variables as errors, by name only", () => {
    const { errors } = checkConfig({}, true);
    expect(errors.join("|")).toMatch(/DATABASE_URL/);
    expect(errors.join("|")).toMatch(/AUTH_SECRET/);
    expect(errors.join("|")).toMatch(/APP_URL/);
  });

  it("does not require APP_URL or https outside production", () => {
    expect(checkConfig({ ...GOOD, APP_URL: undefined }, false).errors).toEqual([]);
  });

  it("requires https for APP_URL in production", () => {
    expect(checkConfig({ ...GOOD, APP_URL: "http://example.test" }, true).errors).toHaveLength(1);
  });

  it("rejects a placeholder or short AUTH_SECRET and warns on a mid-length one", () => {
    expect(checkConfig({ ...GOOD, AUTH_SECRET: "replace-me" }, true).errors).toHaveLength(1);
    expect(checkConfig({ ...GOOD, AUTH_SECRET: "short" }, true).errors).toHaveLength(1);
    const mid = checkConfig({ ...GOOD, AUTH_SECRET: "m".repeat(20) }, true);
    expect(mid.errors).toEqual([]);
    expect(mid.warnings.join("|")).toMatch(/AUTH_SECRET/);
  });

  it("rejects a DATABASE_URL that is not a postgres URL", () => {
    expect(checkConfig({ ...GOOD, DATABASE_URL: "mysql://x" }, true).errors).toHaveLength(1);
  });

  it("warns (not errors) when join-code key is shared or missing, and on weak support password", () => {
    const shared = checkConfig({ ...GOOD, JOIN_CODE_SECRET: GOOD.AUTH_SECRET }, true);
    expect(shared.errors).toEqual([]);
    expect(shared.warnings.join("|")).toMatch(/JOIN_CODE_SECRET/);
    expect(checkConfig({ ...GOOD, JOIN_CODE_SECRET: undefined }, true).warnings.join("|")).toMatch(/JOIN_CODE_SECRET/);
    expect(checkConfig({ ...GOOD, SUPPORT_ACCESS_PASSWORD: "short" }, true).warnings.join("|")).toMatch(/SUPPORT_ACCESS_PASSWORD/);
  });

  it("flags values that would silently fall back to a default", () => {
    const w = checkConfig({ ...GOOD, TRUSTED_PROXY_HOPS: "9", DB_POOL_MAX: "abc", GITHUB_RELEASE_REPO: "bad", ALLOWED_ORIGINS: "not-an-origin" }, true).warnings.join("|");
    for (const name of ["TRUSTED_PROXY_HOPS", "DB_POOL_MAX", "GITHUB_RELEASE_REPO", "ALLOWED_ORIGINS"]) expect(w).toContain(name);
  });

  it("warns when the reset email cannot be sent: it needs BOTH the key and the sender address", () => {
    const text = (env: Parameters<typeof checkConfig>[0]) => checkConfig(env, true).warnings.join("|");
    expect(text({ ...GOOD, RESEND_API_KEY: undefined })).toMatch(/RESEND_API_KEY/);
    expect(text({ ...GOOD, RESEND_FROM_EMAIL: undefined })).toMatch(/RESEND_FROM_EMAIL/);
    expect(text(GOOD)).not.toMatch(/RESEND/);
  });

  it("flags a pointless or implausible AUTH_SECRET_PREVIOUS but accepts a real one", () => {
    expect(checkConfig({ ...GOOD, AUTH_SECRET_PREVIOUS: "c".repeat(44) }, true)).toEqual({ errors: [], warnings: [] });
    expect(checkConfig({ ...GOOD, AUTH_SECRET_PREVIOUS: GOOD.AUTH_SECRET }, true).warnings.join("|")).toMatch(/AUTH_SECRET_PREVIOUS/);
    expect(checkConfig({ ...GOOD, AUTH_SECRET_PREVIOUS: "short" }, true).warnings.join("|")).toMatch(/AUTH_SECRET_PREVIOUS/);
  });

  it("never echoes a secret value", () => {
    const secret = "super-secret-value-that-must-not-leak-1234567890";
    const report = checkConfig({ ...GOOD, AUTH_SECRET: secret, DATABASE_URL: `mysql://u:${secret}@h/db` }, true);
    expect(JSON.stringify(report)).not.toContain(secret);
  });
});
