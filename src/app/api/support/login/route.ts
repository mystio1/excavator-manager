import crypto from "node:crypto";
import { errorResponse } from "@/lib/api-error";
import { enforceAuthLimits, supportLoginRules } from "@/lib/auth-throttle";
import { logger } from "@/lib/logger";
import { clientIp } from "@/lib/rateLimit";
import { createSupportSession } from "@/lib/supportTokens";
import { supportLoginSchema } from "@/lib/validation/support";
import { json, parseBody, withApi } from "@/lib/with-api";

/** Constant-time string comparison: both sides are reduced to fixed-length
 * digests first, so neither the content NOR the length of the real password
 * shows up in how long the comparison takes. */
function safeEqual(a: string, b: string): boolean {
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

// Not reachable from anywhere in the normal owner/operator-facing UI —
// only by navigating straight to /support. A single shared password
// (SUPPORT_ACCESS_PASSWORD, unset by default — see below) opens a
// one-hour, revocable support session (an opaque token whose hash is stored
// in the SupportSession table) that can list every business on the platform
// and open any of them as their admin, for remote troubleshooting.
export const POST = withApi("support.login", async (req) => {
  const supportPassword = process.env.SUPPORT_ACCESS_PASSWORD;
  // Disabled entirely (404s) unless deliberately configured — never ships
  // active with no password set. JSON body, like every other route here —
  // apiFetch always tries to JSON.parse the response.
  if (!supportPassword) return errorResponse("NOT_FOUND", "Not found");

  const { password } = await parseBody(req, supportLoginSchema);

  // This one password unlocks every business on the platform if
  // brute-forced, so it gets the strictest limits in the app: 3 attempts per
  // 15 minutes per IP and 30 failed attempts per day platform-wide (see supportLoginRules).
  const throttle = await enforceAuthLimits(supportLoginRules(clientIp(req)), { stopAtFirstBlock: true });

  if (!safeEqual(password, supportPassword)) return errorResponse("UNAUTHORIZED", "Incorrect password");

  // A correct password is not a failed guess.
  await throttle.refund();

  const session = await createSupportSession();
  logger.info("support session opened", { supportSessionId: session.id });
  return json({ token: session.token, expiresAt: session.expiresAt });
});
