import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { assertSignedIn, signInFailureResponse } from "@/lib/signin-response";
import { json, parseBody, withApi } from "@/lib/with-api";
import { loginSchema } from "@/lib/validation/auth";

/**
 * Owner login. Throttling, the timing-safe unknown-account handling and the
 * frozen check all live in the credentials provider (services/auth.ts ->
 * authenticateOwner), so they also cover a direct call to the NextAuth
 * callback. Here we only translate the outcome:
 *   wrong password / unknown account -> the same 401
 *   too many attempts                -> 429 + Retry-After
 *   frozen business                  -> 423, but only once the password was
 *                                       correct (otherwise it would reveal
 *                                       that the account exists)
 */
export const POST = withApi("auth.login", async (req) => {
  const input = await parseBody(req, loginSchema);

  try {
    // redirect: false — signIn still sets the session cookie (same
    // underlying Auth() call as the redirecting form), it just returns a
    // URL string instead of throwing Next's redirect signal, which only
    // makes sense in a Server Action / page render, not a Route Handler.
    assertSignedIn(await signIn("credentials", { identifier: input.identifier, password: input.password, redirect: false }));
  } catch (error) {
    if (error instanceof AuthError) return signInFailureResponse(error, "Wrong email/phone or password");
    throw error;
  }

  return json({ ok: true });
});
