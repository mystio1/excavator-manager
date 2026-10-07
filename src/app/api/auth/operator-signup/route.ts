import { failureResponse } from "@/lib/api-error";
import { clientIp, enforceRateLimits, hashPart } from "@/lib/rateLimit";
import {
  assertBusinessCodeAttemptsAllowed,
  recordInvalidBusinessCode,
  requestOperatorJoin,
} from "@/lib/services/operators";
import { normalizeBusinessCode } from "@/lib/utils/businessCode";
import { operatorSignupSchema } from "@/lib/validation/operator";
import { json, parseBody, withApi } from "@/lib/with-api";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Operator self-service "request to join". Unauthenticated by nature, so it is
 * rate limited on every axis an attacker could vary:
 *   - per IP            10 / hour
 *   - per mobile number  5 / hour
 *   - per business code 30 / hour
 *   - INVALID business codes per IP: 5 / 15 min — checked BEFORE the lookup, so
 *     once an IP has burned its allowance even a valid code is refused (the
 *     limit cannot be used to tell valid codes from invalid ones).
 *
 * It never creates or changes an Operator row — see requestOperatorJoin. The
 * response carries the one-time verification code the admin must type to
 * approve the request (also inside `message`, which is all old apps display).
 */
export const POST = withApi("operators.signup", async (req) => {
  const input = await parseBody(req, operatorSignupSchema);
  const ip = clientIp(req);

  await assertBusinessCodeAttemptsAllowed(ip);
  await enforceRateLimits([
    { key: `operator-signup:ip:${ip}`, limit: 10, windowMs: HOUR_MS },
    { key: `operator-signup:mobile:${hashPart(input.mobile)}`, limit: 5, windowMs: HOUR_MS },
    { key: `operator-signup:code:${hashPart(normalizeBusinessCode(input.businessCode))}`, limit: 30, windowMs: HOUR_MS },
  ]);

  const result = await requestOperatorJoin(input.businessCode, input.name, input.mobile, input.pin);
  if ("error" in result) {
    if (result.code === "NOT_FOUND") await recordInvalidBusinessCode(ip);
    return failureResponse(result);
  }

  // The code is shown once — make sure no intermediary caches the response.
  return json(
    { success: true, message: result.message, verificationCode: result.verificationCode },
    { headers: { "Cache-Control": "no-store" } },
  );
});
