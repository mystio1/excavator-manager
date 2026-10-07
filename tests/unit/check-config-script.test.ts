import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * scripts/check-config.mjs is the pre-deploy gate: same validation as startup and /api/health/ready, but it
 * exits non-zero so a bad configuration can fail the deploy. It must also never print a value.
 */
const SECRET_MARKER = "do-not-print-this-secret-value-0123456789abcdef";

function run(env: Record<string, string>, ...args: string[]) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "scripts/check-config.mjs", ...args], {
    // A minimal environment on purpose: dotenv must not be able to fill gaps from a developer's .env... except it
    // reads ./.env, so every variable the checks look at is set explicitly below.
    env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

const GOOD = {
  DATABASE_URL: "postgresql://u:p@host:5432/db",
  AUTH_SECRET: "a".repeat(44),
  APP_URL: "https://app.example.test",
  JOIN_CODE_SECRET: "b".repeat(44),
  RESEND_API_KEY: "re_x",
  RESEND_FROM_EMAIL: "Excavator <no-reply@example.test>",
  SUPPORT_ACCESS_PASSWORD: "x".repeat(24),
};

describe("npm run check:config", () => {
  it("exits 0 for a complete production configuration", () => {
    const r = run(GOOD, "--production");
    expect(r.code).toBe(0);
    expect(r.out).toContain("0 error(s)");
  });

  it("exits 1 when a required variable is missing or a placeholder, naming it", () => {
    const r = run({ ...GOOD, AUTH_SECRET: "replace-me", APP_URL: "" }, "--production");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/AUTH_SECRET/);
    expect(r.out).toMatch(/APP_URL/);
  });

  it("warnings alone pass, but fail with --strict", () => {
    const env = { ...GOOD, JOIN_CODE_SECRET: "" };
    expect(run(env, "--production").code).toBe(0);
    expect(run(env, "--production", "--strict").code).toBe(1);
  });

  it("never prints a secret value", () => {
    const r = run({ ...GOOD, AUTH_SECRET: SECRET_MARKER.slice(0, 10), DATABASE_URL: `mysql://u:${SECRET_MARKER}@h/db` }, "--production");
    expect(r.code).toBe(1);
    expect(r.out).not.toContain(SECRET_MARKER);
  });
});
