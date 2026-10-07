/**
 * Policy for NEW passwords (register, password reset, password change).
 *
 * Deliberately NOT applied to login: accounts created under the old
 * "6 characters" rule must keep working, so the login schema only requires a
 * non-empty value. Kept free of bcrypt/Node imports so client forms can show
 * the same wording the server enforces.
 */

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt only reads the first 72 BYTES of its input; anything beyond is
 * silently ignored, so two long passwords differing only after byte 72 would
 * be accepted interchangeably. Reject instead of truncating. */
export const PASSWORD_MAX_BYTES = 72;

export const PASSWORD_RULES_HINT = "At least 8 characters, with a letter and a number.";

const utf8 = new TextEncoder();

/** Returns a friendly message for the first rule the password breaks, or null when it is acceptable. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/\p{L}/u.test(password)) {
    return "Password must include at least one letter.";
  }
  if (!/\p{Nd}/u.test(password)) {
    return "Password must include at least one number.";
  }
  if (utf8.encode(password).length > PASSWORD_MAX_BYTES) {
    return `Password is too long — use at most ${PASSWORD_MAX_BYTES} bytes (about ${PASSWORD_MAX_BYTES} characters).`;
  }
  return null;
}
