/**
 * The secret(s) Auth.js uses for session cookies.
 *
 * Rolling rotation WITHOUT logging everyone out:
 *   1. set AUTH_SECRET_PREVIOUS to the current AUTH_SECRET value,
 *   2. set AUTH_SECRET to a new random value, deploy;
 *   3. after the longest session lifetime (30 days, see src/lib/auth.ts) remove AUTH_SECRET_PREVIOUS.
 * New cookies are encrypted with AUTH_SECRET; cookies issued under the previous value still decrypt (Auth.js
 * matches the key by its thumbprint) and are re-issued under the new one as they are used.
 *
 * Why this exists: next-auth 5.0.0-beta.32 fills `config.secret` from AUTH_SECRET as a plain string BEFORE
 * @auth/core would assemble its AUTH_SECRET_1..3 list, so those variables are silently ignored (verified in
 * node_modules/next-auth/lib/env.js and @auth/core/lib/utils/env.js). Passing the array explicitly is the
 * supported way. With no AUTH_SECRET_PREVIOUS this returns the same single string as before.
 *
 * Operator join codes are keyed separately (JOIN_CODE_SECRET) and have no rolling mechanism.
 */
export function authSecrets(env: Record<string, string | undefined> = process.env): string | string[] | undefined {
  const current = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET;
  if (!current) return undefined;
  const previous = env.AUTH_SECRET_PREVIOUS;
  return previous && previous !== current ? [current, previous] : current;
}
