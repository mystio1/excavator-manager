# ADR-0003: One API error contract, `error` stays a string

Status: accepted

## Context
Routes returned `{ error: "…" }` with ad-hoc statuses (400 for everything).
Clients cannot react to a *kind* of failure (stale record vs. duplicate vs. rate
limited) and raw errors risked leaking internals.

## Decision
Every error body is
`{ "error": "<human message>", "code": "<MACHINE_CODE>", "requestId": "…", "details"?: … }`
with correct statuses: 400 malformed · 401 · 403 (incl. `CSRF_VALIDATION_FAILED`)
· 404 · 409 (`RESOURCE_MODIFIED`, `WORK_SESSION_ALREADY_BILLED`,
`PAYMENT_EXCEEDS_BALANCE`, `BILL_TOTAL_BELOW_PAID`, `BILL_NUMBER_TAKEN`,
`IDEMPOTENCY_KEY_REUSED`) · 422 validation · 423 frozen · 429 (with
`Retry-After`) · 500 (generic message; the real error only in the server log).

**`error` is deliberately a string, not `{ code, message }`.** Installed Android
apps bundle their own UI and read `body.error` as text; a nested object would
render as "[object Object]" for every user until they update. `code` is the
machine-readable field. Success bodies are unchanged.

**RFC 9457 alignment (additive).** The same body also carries the standard
problem-details members: `type` (`urn:excavator:problem:<code-kebab>`), `title`
(fixed per code), `status` (equals the HTTP status), `detail` (same text as
`error`) and `instance` (`urn:request:<requestId>`). A standards-aware client or
gateway can therefore consume our errors without knowing our fields, while old
clients keep reading `error`/`code`. The media type stays `application/json`
rather than `application/problem+json` on purpose — some installed clients sniff
it — so this is "RFC 9457-shaped", not strictly compliant, and that is a
documented trade-off. The body is built in one place, `src/lib/problem.ts`, used
by both `errorResponse()` and the CSRF rejection in `src/proxy.ts`.

`withApi()` guarantees the contract (and a request id in logs and the
`x-request-id` header) for thrown errors, Zod errors and known Prisma errors;
services return `fail(code, message)` for expected failures.

## Consequences
Old and new clients both work. If the old-app population is ever retired, the
body can be nested without touching routes (only `errorResponse`).
