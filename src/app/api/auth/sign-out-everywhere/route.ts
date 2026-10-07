import { requireBusinessApi } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-error";
import { signOut } from "@/lib/auth";
import { signOutEverywhere } from "@/lib/services/auth";
import { json, withApi } from "@/lib/with-api";

/**
 * Revokes every session of the signed-in owner on every device (User.tokenVersion
 * is bumped; each request re-checks it), this one included — the caller's cookie
 * is cleared too and the client goes back to the login screen.
 */
export const POST = withApi("auth.signOutEverywhere", async () => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  // A support impersonation session is not the owner and must not revoke the owner's real sessions.
  if (auth.session.supportSessionId) {
    return errorResponse("FORBIDDEN", "This action is not available in a support session.");
  }

  await signOutEverywhere(auth.session.userId, auth.session.businessId);
  await signOut({ redirect: false });
  return json({ ok: true });
});
