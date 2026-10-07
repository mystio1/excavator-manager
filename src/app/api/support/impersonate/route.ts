import { AuthError } from "next-auth";
import { errorResponse, failureResponse } from "@/lib/api-error";
import { signIn } from "@/lib/auth";
import { requireSupportApi } from "@/lib/supportTokens";
import { findImpersonationTarget } from "@/lib/services/support";
import { assertSignedIn } from "@/lib/signin-response";
import { supportBusinessSchema } from "@/lib/validation/support";
import { json, parseBody, withApi } from "@/lib/with-api";

export const POST = withApi("support.impersonate", async (req) => {
  const auth = await requireSupportApi(req);
  if (auth.error) return auth.error;

  const input = await parseBody(req, supportBusinessSchema);

  const target = await findImpersonationTarget(input.businessCode);
  if ("error" in target) return failureResponse(target);

  try {
    // Real session, same as a normal login — the rest of the app needs no
    // special-casing to work once support is "in" as this owner. The
    // support-impersonate provider re-checks the token against the database
    // itself (auth.ts) and writes the audit entry in the target business, so
    // this can't be used to sign in as anyone without a live support session.
    // The owner session it creates ends when this support session does.
    assertSignedIn(
      await signIn("support-impersonate", {
        userId: target.owner.id,
        supportToken: auth.token,
        reason: input.reason,
        redirect: false,
      }),
    );
  } catch (error) {
    if (error instanceof AuthError) return errorResponse("UNAUTHORIZED", "Could not access this business");
    throw error;
  }

  return json({ ok: true });
});
