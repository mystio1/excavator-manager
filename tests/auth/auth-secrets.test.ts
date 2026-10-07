import { describe, expect, it } from "vitest";
import { decode, encode } from "@auth/core/jwt";
import { authSecrets } from "@/lib/auth-secrets";

/**
 * Rolling AUTH_SECRET rotation. These use Auth.js's real JWT encode/decode (the code that seals the session
 * cookie), so they prove the rotation procedure in docs/runbook-recovery.md and docs/configuration.md works
 * and that the old, unsupported AUTH_SECRET_1..3 route is not what we rely on.
 */
const OLD = "old-secret-old-secret-old-secret-0123456789";
const NEW = "new-secret-new-secret-new-secret-9876543210";
const SALT = "__Secure-authjs.session-token";
const claims = { sub: "user-1", businessId: "b-1", role: "OWNER", tokenVersion: 3 };

describe("authSecrets()", () => {
  it("is the single secret as a plain string when no previous one is set (unchanged behaviour)", () => {
    expect(authSecrets({ AUTH_SECRET: NEW })).toBe(NEW);
  });
  it("is [current, previous] during a rotation, current FIRST", () => {
    expect(authSecrets({ AUTH_SECRET: NEW, AUTH_SECRET_PREVIOUS: OLD })).toEqual([NEW, OLD]);
  });
  it("ignores a previous value equal to the current one, and an empty one", () => {
    expect(authSecrets({ AUTH_SECRET: NEW, AUTH_SECRET_PREVIOUS: NEW })).toBe(NEW);
    expect(authSecrets({ AUTH_SECRET: NEW, AUTH_SECRET_PREVIOUS: "" })).toBe(NEW);
  });
  it("is undefined when no secret is configured (Auth.js then reports MissingSecret)", () => {
    expect(authSecrets({})).toBeUndefined();
  });
});

describe("rolling rotation with the real Auth.js JWT code", () => {
  it("a session issued under the OLD secret still decodes while the old one is kept as previous", async () => {
    const cookie = await encode({ token: claims, secret: OLD, salt: SALT });
    const during = authSecrets({ AUTH_SECRET: NEW, AUTH_SECRET_PREVIOUS: OLD })!;
    const payload = await decode({ token: cookie, secret: during, salt: SALT });
    expect(payload).toMatchObject(claims);
  });

  it("new sessions are sealed with the NEW secret (the old one is not needed to read them)", async () => {
    const during = authSecrets({ AUTH_SECRET: NEW, AUTH_SECRET_PREVIOUS: OLD })!;
    const cookie = await encode({ token: claims, secret: during, salt: SALT });
    expect(await decode({ token: cookie, secret: NEW, salt: SALT })).toMatchObject(claims);
    await expect(decode({ token: cookie, secret: OLD, salt: SALT })).rejects.toThrow();
  });

  it("once the previous secret is removed, old sessions stop working (the end of the rotation)", async () => {
    const cookie = await encode({ token: claims, secret: OLD, salt: SALT });
    await expect(decode({ token: cookie, secret: authSecrets({ AUTH_SECRET: NEW })!, salt: SALT })).rejects.toThrow();
  });

  it("without the previous secret a rotation logs everyone out (why AUTH_SECRET_PREVIOUS exists)", async () => {
    const cookie = await encode({ token: claims, secret: OLD, salt: SALT });
    await expect(decode({ token: cookie, secret: NEW, salt: SALT })).rejects.toThrow();
  });

  it("a cookie sealed with an unrelated secret is rejected even during a rotation", async () => {
    const forged = await encode({ token: claims, secret: "attacker-secret-attacker-secret-0123456789", salt: SALT });
    const during = authSecrets({ AUTH_SECRET: NEW, AUTH_SECRET_PREVIOUS: OLD })!;
    await expect(decode({ token: forged, secret: during, salt: SALT })).rejects.toThrow();
  });
});
