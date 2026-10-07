# API & service conventions

The contract every route handler and service follows. The shared building
blocks live in `src/lib/`; read the file header comments there for the "why".

## 1. Route handlers

```ts
// src/app/api/bills/[id]/route.ts
import { withApi, parseBody, json } from "@/lib/with-api";
import { requireBusinessApi } from "@/lib/api-auth";
import { failureResponse } from "@/lib/api-error";

export const PATCH = withApi("bills.update", async (req, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;                         // 401 / 423 already standardized
  const { id } = await params;
  const input = await parseBody(req, updateBillSchema);       // 400 bad JSON / 422 VALIDATION_FAILED
  const result = await updateBill(auth.session.businessId, auth.actor, id, input);
  if ("error" in result) return failureResponse(result);      // { error, code, requestId } with the right status
  return json(result);
});
```

* Every authenticated/mutating handler is wrapped in `withApi(operation, handler)` (the two
  DB-free health probes and the public, read-only `app-version` route are deliberate
  exceptions: no per-request log line, and `app-version` keeps its legacy error bodies). It adds a
  request id, structured logging, and converts thrown errors to the contract
  (`ApiHttpError`, `ZodError`, Prisma P2002/P2025 → 409/404, anything else →
  generic 500 with the detail only in the server log).
* Never return `NextResponse.json({ error: "…" }, { status })` by hand. Use
  `errorResponse(code, message)` / `failureResponse(serviceResult)` /
  `throw new ApiHttpError(code, message)`.
* Status codes: 400 malformed · 401 unauthenticated · 403 forbidden/CSRF ·
  404 not found · 409 conflict (`RESOURCE_MODIFIED`,
  `WORK_SESSION_ALREADY_BILLED`, `PAYMENT_EXCEEDS_BALANCE`,
  `BILL_TOTAL_BELOW_PAID`, `BILL_NUMBER_TAKEN`, `IDEMPOTENCY_KEY_REUSED`,
  generic `CONFLICT`) · 422 validation · 423 frozen · 429 rate limited · 500.
* Response body on error: `{ "error": "<message string>", "code": "<CODE>",
  "requestId": "…", "details"?: … }`. **`error` stays a string** — installed
  Android apps bundle their UI and read `body.error` as text. The same body also carries the
  RFC 9457 members `type`, `title`, `status`, `detail`, `instance` (additive; ADR-0003). Media
  type stays `application/json`. `503 SERVICE_BUSY` (with `Retry-After`) means "transient,
  safe to retry"; `413 PAYLOAD_TOO_LARGE` means the body exceeded `parseBody`'s byte cap.
* The CSRF/Origin check is centralized in `src/proxy.ts`; routes do nothing for it.
* `requireBusinessApi()` returns `{ session, actor, error }`. Pass `auth.actor`
  to services that write audit entries.

## 2. Services

* Signature: `(businessId, actor, …input, opts?: { tx?: Tx })` for mutating
  functions that are audited or idempotent. Every query is scoped by
  `businessId` — never look a record up by id alone.
* Expected failures are **returned**, not thrown: `return fail("NOT_FOUND", "Bill not found")`
  (`fail()` from `src/lib/api-error.ts`) → `{ error, code }`. Legacy
  `{ error: "…" } as const` still works (maps to 400 BAD_REQUEST) but give new
  and touched failures a proper `code`.
* Use `withTx(opts?.tx, async (tx) => { … })` (`src/lib/tx.ts`) for anything that
  must be atomic. Lock the row (`lockBill(tx, id)`) *before* reading the values
  a decision depends on.

## 3. Money

* Money amounts and billed quantities are Postgres `NUMERIC` → `Prisma.Decimal`
  in code. **No float arithmetic on money.** Use `src/lib/money.ts`:
  `dec()`, `round2()`, `sum()`, `lineAmount(qty, rate)`, `gstSplit()`,
  `paymentStatus()`. Rounding is ROUND_HALF_UP to 2 dp.
* Hours/meter readings (`WorkSession.totalHours`, `DailyWorkLog.hoursWorked`,
  meters) stay `number` (Float columns); round with `Math.round(x*100)/100` when
  writing them, and convert with `dec(Number(h.toFixed(2)))` when they enter a
  money calculation.
* JSON responses carry money as plain numbers (a `toJSON` patch in `money.ts`).
  Client code types service results with `Plain<…>` from `src/lib/plain.ts`:
  `type BillDetail = Plain<NonNullable<Awaited<ReturnType<typeof getBillDetail>>>>`.
* Zod input schemas keep `z.coerce.number()`; convert with `dec()` inside the
  service before any arithmetic or write.

## 4. Audit trail (financial + sensitive mutations)

Inside the SAME transaction as the change:

```ts
await recordAudit(tx, {
  businessId, actor,
  action: "bill.update", entityType: "Bill", entityId: bill.id,
  before: beforeRow, after: afterRow, reason: input.reason,
});
```

Required for: bill create/update/delete, payment create/update/delete, work
session update/delete, daily log add/update/delete/approve/reject, operator
transaction (salary/money) add/update/delete, customer/operator/excavator edits
and archives, service-record changes, expense changes. `before`/`after` are full
row snapshots (secrets are stripped automatically). The table is append-only.
Tests must assert that each of these writes an audit row.

## 5. Idempotency (creates)

Bill, summary-bill and payment creation go through
`runIdempotent({ req, businessId, actorId, operation, payload }, async (tx) => …)`
(`src/lib/idempotency.ts`). The work function receives the transaction, calls
the service with `{ tx }`, and returns `{ ok: true, status: 201, body, resourceType, resourceId }`
or `{ ok: false, failure }`. Clients send `Idempotency-Key` (one per logical
submission): `apiFetch(path, { method: "POST", body, idempotencyKey })`,
generating the key with `newIdempotencyKey()` when the form opens and after each
success. Requests without the header still work (older apps).

## 6. Optimistic concurrency

Mutable records carry `version Int`. PATCH bodies may include
`expectedVersion` (the `version` the client loaded). In the service, inside the
transaction: lock/read the row, `if (isStale(row.version, expectedVersion)) return resourceModified("bill")`,
and **every** update must write `version: { increment: 1 }` (including updates
made as a side effect, e.g. recomputed `totalHours`). Clients show the server
message and offer a reload. Omitted `expectedVersion` (older apps) skips the check.

## 7. Rate limiting

`enforceRateLimits([{ key, limit, windowMs }, …])` from `src/lib/rateLimit.ts`
(DB-backed, shared across instances, survives restarts). Key by IP **and** by
account (`hashPart(identifier)`); IP comes from `clientIp(req)` which only
trusts proxy-appended `X-Forwarded-For` entries. Throws a 429 `RATE_LIMITED`
with `Retry-After`.

## 8. Pagination

List endpoints accept `?limit=&cursor=` (`src/lib/pagination.ts`): stable
ordering with an `id` tie-breaker, response `{ <existingKey>: [...], nextCursor }`.
Without `limit` (old apps) a bounded legacy page of 200 is returned — never
unbounded. New UI sends `limit=50` and a "Load more" button.

## 9. Client

* Use `apiFetch` / `swrFetcher`; on error it throws `ApiError` with `.status`,
  `.code`, `.requestId`.
* Creates send an `idempotencyKey`; edits send `expectedVersion`.
* After mutations call SWR `mutate()` for the affected keys.

## 10. Backward compatibility with installed Android apps

The APK embeds the UI and talks to this API from `https://localhost`. Old
installs do not send `Idempotency-Key` / `expectedVersion`, read `error` as a
string, and ignore `nextCursor`. Every change here is additive for them; do not
remove or rename response fields or change `error` to an object.

## 11. Endpoint reference for the hardening release

**Optimistic concurrency (`expectedVersion`, optional):** body of PATCH
`/api/bills/[id]`, `/api/bills/[id]/payments/[paymentId]`,
`/api/customers/[id]`, `/api/operators/[id]` (+ `/pin`),
`/api/operators/[id]/transactions/[transactionId]`, `/api/work-sessions/[id]`,
`/api/daily-logs/[logId]`, `/api/excavators/[id]`; also accepted on the matching
DELETEs of bills, payments, work sessions, daily logs and machines (customer archive and
operator-transaction DELETE do not take it), on `POST /api/daily-logs/[logId]/approve|reject` (`?expectedVersion=`)
and in the body of `POST /api/excavators/[id]/stop-work`. Stale → `409 RESOURCE_MODIFIED`.

**Idempotent creates (`Idempotency-Key`, optional):** `POST /api/bills`,
`/api/bills/summary`, `/api/bills/direct`, `/api/bills/[id]/payments`,
`/api/operators/[id]/transactions`.

**Cursor pagination (`?limit=&cursor=` → `nextCursor`):** `/api/bills`,
`/api/customers` (+ `/api/search`), `/api/operators`,
`/api/operators/[id]/transactions`, `/api/excavators/[id]/work-history`
(key `history`). Without `limit`: one bounded page of 200.
`/api/customers/options` is bounded to 1000 and `/api/operators/options` to 500; the
machine and site option lists are small and unbounded.

**Operator join flow:** `POST /api/auth/operator-signup` (files a request; the
response carries `verificationCode` once and repeats it in `message`) ·
`GET /api/operators/join-requests` · `POST /api/operators/join-requests/[requestId]/approve`
(`{ code }`) · `POST …/decline`. Legacy `POST /api/operators/[id]/approve-join|decline-join`
still work for requests without a code and answer 409 for coded ones.

**Account security:** `POST /api/auth/change-password` (`{ currentPassword, newPassword }`
→ `{ ok: true }` or `{ ok: true, reauthRequired: true }`) · `POST /api/support/logout`
(revokes the support session).

**Health:** `GET /api/health` liveness (no DB) · `GET /api/health/ready`
readiness (database + required config; 503 when not ready).

**Request size:** the letterhead PATCH (`/api/settings/letterhead`) accepts up to
about 1.6 MB of base64 (three images ≤ 300 KB decoded each; older apps resend
all three on every save).
