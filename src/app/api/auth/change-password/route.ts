import { AuthError } from "next-auth";
import { requireBusinessApi } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-error";
import { signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { changePassword } from "@/lib/services/auth";
import { assertSignedIn, authFailureResponse } from "@/lib/signin-response";
import { json, parseBody, withApi } from "@/lib/with-api";
import { changePasswordSchema } from "@/lib/validation/auth";

/**
 * Signed-in password change. Besides storing the new password it bumps
 * User.tokenVersion, which signs out every session issued before — the
 * caller's own cookie included — so the route signs the caller straight back
 * in (new password, new version) while every OTHER device stays logged out.
 */
export const POST = withApi("auth.changePassword", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  // A support impersonation session is not the owner and must not set the owner's password.
  if (auth.session.supportSessionId) {
    return errorResponse("FORBIDDEN", "This action is not available in a support session.");
  }

  const input = await parseBody(req, changePasswordSchema);

  const result = await changePassword(auth.session.userId, input.currentPassword, input.newPassword);
  if ("error" in result) return authFailureResponse(result);

  // Keep THIS device signed in: its cookie carries the previous version.
  try {
    const user = await db.user.findUnique({ where: { id: auth.session.userId }, select: { email: true } });
    if (!user) throw new Error("account not found after password change");
    assertSignedIn(await signIn("credentials", { identifier: user.email, password: input.newPassword, redirect: false }));
  } catch (error) {
    // The password IS changed; if the fresh session couldn't be issued the
    // client just has to log in again.
    if (!(error instanceof AuthError)) logger.warn("re-sign-in after password change failed", { error: String(error) });
    return json({ ok: true, reauthRequired: true });
  }

  return json({ ok: true });
});
