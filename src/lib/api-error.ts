import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { problemBody } from "@/lib/problem";
import { getRequestId } from "@/lib/request-context";

/**
 * One error contract for every API route.
 *
 *   { "error": "<human message>", "code": "WORK_SESSION_ALREADY_BILLED",
 *     "requestId": "…", "details"?: … }
 *
 * `error` is deliberately still a plain STRING (the machine-readable part is
 * `code`): installed Android apps bundle their own UI and read `body.error` as
 * text, so a nested { error: { code, message } } object would show
 * "[object Object]" to every user who has not updated yet. See
 * docs/adr/0003-error-contract.md.
 *
 * The body ALSO carries the RFC 9457 "problem details" members — `type`,
 * `title`, `status`, `detail`, `instance` — additively, so a standards-aware
 * client can consume it without knowing our fields. The media type stays
 * application/json (not application/problem+json) on purpose: older clients
 * may sniff it.
 */

export type ErrorCode =
  | "BAD_REQUEST" // 400 malformed request / body
  | "UNAUTHORIZED" // 401
  | "FORBIDDEN" // 403
  | "CSRF_VALIDATION_FAILED" // 403
  | "ACCOUNT_FROZEN" // 423
  | "NOT_FOUND" // 404
  | "VALIDATION_FAILED" // 422
  | "PAYLOAD_TOO_LARGE" // 413
  | "CONFLICT" // 409 generic business conflict
  | "RESOURCE_MODIFIED" // 409 optimistic-concurrency failure
  | "WORK_SESSION_ALREADY_BILLED" // 409
  | "PAYMENT_EXCEEDS_BALANCE" // 409
  | "BILL_TOTAL_BELOW_PAID" // 409
  | "BILL_NUMBER_TAKEN" // 409
  | "IDEMPOTENCY_KEY_REUSED" // 409
  | "RATE_LIMITED" // 429
  | "INTERNAL_ERROR" // 500
  | "SERVICE_BUSY"; // 503 transient overload (e.g. transaction queue timed out) — safe to retry

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CSRF_VALIDATION_FAILED: 403,
  ACCOUNT_FROZEN: 423,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  PAYLOAD_TOO_LARGE: 413,
  CONFLICT: 409,
  RESOURCE_MODIFIED: 409,
  WORK_SESSION_ALREADY_BILLED: 409,
  PAYMENT_EXCEEDS_BALANCE: 409,
  BILL_TOTAL_BELOW_PAID: 409,
  BILL_NUMBER_TAKEN: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_BUSY: 503,
};

export function statusFor(code: ErrorCode): number {
  return STATUS[code];
}

/** Short, stable, human-readable summary per code (RFC 9457 `title`). Unlike
 * `detail`/`error` it never varies between occurrences. */
export const TITLE: Record<ErrorCode, string> = {
  BAD_REQUEST: "Bad request",
  UNAUTHORIZED: "Authentication required",
  FORBIDDEN: "Forbidden",
  CSRF_VALIDATION_FAILED: "Cross-site request rejected",
  ACCOUNT_FROZEN: "Account frozen",
  NOT_FOUND: "Not found",
  VALIDATION_FAILED: "Validation failed",
  PAYLOAD_TOO_LARGE: "Payload too large",
  CONFLICT: "Conflict",
  RESOURCE_MODIFIED: "Resource was modified",
  WORK_SESSION_ALREADY_BILLED: "Work record already billed",
  PAYMENT_EXCEEDS_BALANCE: "Payment exceeds balance",
  BILL_TOTAL_BELOW_PAID: "Bill total below amount paid",
  BILL_NUMBER_TAKEN: "Bill number already used",
  IDEMPOTENCY_KEY_REUSED: "Idempotency key reused",
  RATE_LIMITED: "Too many requests",
  INTERNAL_ERROR: "Internal error",
  SERVICE_BUSY: "Service busy",
};

/** Thrown anywhere inside a withApi() route (services included) to produce a
 * specific, controlled HTTP error. */
export class ApiHttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message: string,
    opts?: { status?: number; details?: unknown; headers?: Record<string, string> },
  ) {
    super(message);
    this.name = "ApiHttpError";
    this.code = code;
    this.status = opts?.status ?? STATUS[code];
    this.details = opts?.details;
    this.headers = opts?.headers;
  }
}

/** What a service function returns instead of throwing for an expected
 * failure. `code` is optional so legacy `{ error: "…" }` results keep working
 * (they map to BAD_REQUEST / 400). */
export type ServiceFailure = { error: string; code?: ErrorCode };

/** Typed helper for services: `return fail("RESOURCE_MODIFIED", "…")`. */
export function fail<C extends ErrorCode>(code: C, message: string) {
  return { error: message, code } as const;
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  opts?: { status?: number; details?: unknown; headers?: Record<string, string> },
) {
  const requestId = getRequestId();
  const status = opts?.status ?? STATUS[code];
  const res = NextResponse.json(
    problemBody({ code, title: TITLE[code], message, status, requestId, details: opts?.details }),
    { status, headers: opts?.headers },
  );
  if (requestId) res.headers.set("x-request-id", requestId);
  return res;
}

/** Turns a service's `{ error, code? }` result into the HTTP response. */
export function failureResponse(failure: ServiceFailure) {
  return errorResponse(failure.code ?? "BAD_REQUEST", failure.error);
}

export function validationErrorResponse(error: ZodError) {
  const issue = error.issues[0];
  return errorResponse("VALIDATION_FAILED", issue?.message ?? "Please check the form", {
    details: error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}
