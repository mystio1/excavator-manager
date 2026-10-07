import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, passwordPolicyError } from "@/lib/password-policy";
import { changePasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validation/auth";

describe("password policy (new passwords)", () => {
  it("accepts 8+ characters with a letter and a digit", () => {
    expect(passwordPolicyError("abcdefg1")).toBeNull();
    expect(passwordPolicyError("Correct-Horse-9")).toBeNull();
    expect(passwordPolicyError("12345678a")).toBeNull();
  });

  it("rejects a password shorter than the minimum, with a friendly message", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(passwordPolicyError("abc123")).toMatch(/at least 8 characters/i);
    expect(passwordPolicyError("a1b2c3d")).toMatch(/at least 8 characters/i); // 7 chars
  });

  it("requires a letter", () => {
    expect(passwordPolicyError("12345678")).toMatch(/letter/i);
    expect(passwordPolicyError("!!!!!!!!9")).toMatch(/letter/i);
  });

  it("requires a digit", () => {
    expect(passwordPolicyError("abcdefghij")).toMatch(/number/i);
    expect(passwordPolicyError("Password!")).toMatch(/number/i);
  });

  it("caps the password at 72 BYTES (bcrypt ignores everything after)", () => {
    expect(PASSWORD_MAX_BYTES).toBe(72);
    expect(passwordPolicyError("a1" + "x".repeat(70))).toBeNull(); // exactly 72 bytes
    expect(passwordPolicyError("a1" + "x".repeat(71))).toMatch(/too long/i); // 73 bytes
    // 40 two-byte characters + 'a1' = 42 characters but 82 bytes.
    expect(passwordPolicyError("a1" + "é".repeat(40))).toMatch(/too long/i);
  });
});

describe("validation schemas apply the policy to NEW passwords only", () => {
  it("register rejects a weak password with the policy message", () => {
    const result = registerSchema.safeParse({
      businessName: "B",
      ownerName: "O",
      phone: "9876543210",
      email: "o@example.com",
      password: "short1",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/at least 8 characters/i);
  });

  it("reset and change reject weak passwords too", () => {
    const reset = resetPasswordSchema.safeParse({ token: "t", password: "allletters", confirmPassword: "allletters" });
    expect(reset.success).toBe(false);
    const change = changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "12345678" });
    expect(change.success).toBe(false);
    const ok = changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "fine-pass-1" });
    expect(ok.success).toBe(true);
  });

  it("login accepts whatever password already exists (old 6-char accounts must not be locked out)", () => {
    expect(loginSchema.safeParse({ identifier: "a@b.co", password: "abc123" }).success).toBe(true);
    expect(loginSchema.safeParse({ identifier: "a@b.co", password: "123456" }).success).toBe(true);
    expect(loginSchema.safeParse({ identifier: "a@b.co", password: "" }).success).toBe(false);
  });
});
