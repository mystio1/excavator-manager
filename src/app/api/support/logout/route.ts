import { bearerToken, revokeSupportToken } from "@/lib/supportTokens";
import { logger } from "@/lib/logger";
import { json, withApi } from "@/lib/with-api";

/** Ends the support session: its token stops working immediately, and so does
 * any owner session it opened by impersonation. Idempotent — logging out an
 * already-dead or unknown token is still `{ ok: true }` (nothing to learn from
 * the answer, and the console's "Exit" button must always succeed). */
export const POST = withApi("support.logout", async (req) => {
  const token = bearerToken(req);
  if (token && (await revokeSupportToken(token))) logger.info("support session closed");
  return json({ ok: true });
});
