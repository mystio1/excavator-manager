import { NextResponse } from "next/server";
import { errorResponse, failureResponse, type ServiceFailure } from "@/lib/api-error";
import { rateLimitedError } from "@/lib/auth-throttle";
import { getRequestId } from "@/lib/request-context";

/**
 * The login routes' side of the sign-in contract (the provider's side is
 * `SignInRefused` in auth.ts): turns the AuthError that signIn() throws into
 * the HTTP response. Kept free of any next-auth import so it is unit-testable.
 */

export const FROZEN_LOGIN_MESSAGE =
  "This account has been frozen by our support team. Your data is safe — contact support for recovery.";

/** Maps the error thrown by `signIn(..., { redirect: false })`:
 *   rate_limited   -> 429 RATE_LIMITED + Retry-After
 *   account_frozen -> 423 ACCOUNT_FROZEN, keeping the legacy top-level
 *                     `frozen: true` flag older apps read (only ever reached
 *                     after the password verified)
 *   anything else  -> 401 with the one generic message for "unknown account"
 *                     and "wrong password" alike. */
export function signInFailureResponse(error: unknown, genericMessage: string): Response {
  const { code, retryAfterSec } = error as { code?: unknown; retryAfterSec?: unknown };

  if (code === "rate_limited") {
    const wait = typeof retryAfterSec === "number" && retryAfterSec > 0 ? Math.ceil(retryAfterSec) : 60;
    const limited = rateLimitedError(wait);
    return errorResponse(limited.code, limited.message, {
      status: limited.status,
      details: limited.details,
      headers: limited.headers,
    });
  }

  if (code === "account_frozen") {
    const requestId = getRequestId();
    const res = NextResponse.json(
      {
        error: FROZEN_LOGIN_MESSAGE,
        code: "ACCOUNT_FROZEN",
        ...(requestId ? { requestId } : {}),
        frozen: true,
        details: { frozen: true },
      },
      { status: 423 },
    );
    if (requestId) res.headers.set("x-request-id", requestId);
    return res;
  }

  // Only a genuine credentials failure is "wrong password". Anything else Auth.js
  // wraps in an AuthError (a database outage or pool exhaustion inside authorize()
  // arrives as CallbackRouteError) must NOT be reported as a bad password — it is a
  // server problem: rethrow so withApi() answers a generic 500 and logs the cause.
  const type = (error as { type?: unknown }).type;
  if (type !== undefined && type !== "CredentialsSignin") throw error;

  return errorResponse("UNAUTHORIZED", genericMessage);
}

/**
 * signIn() only THROWS for an AuthError; if authorize() hit an unexpected
 * failure (database down, ...) Auth.js answers with a redirect to its error
 * page instead, and `redirect: false` hands that URL back as the "result". A
 * route must not report success for that.
 */
export function assertSignedIn(result: unknown): void {
  if (typeof result !== "string") return;
  let failed = false;
  try {
    failed = new URL(result, "http://localhost").pathname === "/api/auth/error";
  } catch {
    failed = false;
  }
  if (failed) throw new Error("Sign-in did not complete");
}

/** failureResponse() for an auth service result: like it, but a throttled
 * failure also carries Retry-After (and details.retryAfterSec), which a bare
 * `{ error, code }` has no room for. */
export function authFailureResponse(failure: ServiceFailure & { retryAfterSec?: number }): Response {
  if (failure.code === "RATE_LIMITED" && failure.retryAfterSec) {
    return errorResponse("RATE_LIMITED", failure.error, {
      headers: { "Retry-After": String(failure.retryAfterSec) },
      details: { retryAfterSec: failure.retryAfterSec },
    });
  }
  return failureResponse(failure);
}
