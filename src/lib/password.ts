import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/** A real bcrypt hash (cost = SALT_ROUNDS) of a random value nobody knows. */
const DUMMY_PASSWORD_HASH = "$2b$10$BjOfO6JEaS67qCHcSlvYVO3LlsMUoXwVqQNGp77DPI9PMe2gS4O5e";

/**
 * Compares against `hash`, or — when there is no account/hash — against a
 * dummy hash of the same cost, so "unknown user" takes as long as "wrong
 * password" and response time can't be used to discover which identifiers are
 * registered. Always false for the dummy.
 */
export async function verifyPasswordOrDummy(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, DUMMY_PASSWORD_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
