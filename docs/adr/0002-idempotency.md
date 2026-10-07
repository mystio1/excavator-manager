# ADR-0002: Idempotency keys for financial creates

Status: accepted

## Context
A client submits a bill/payment, the server commits it, the response is lost
(mobile network, app killed). The user taps again → a duplicate bill (and a
consumed bill number) or a double payment.

## Decision
Creates of bills, summary bills, direct bills, payments (and operator money
transactions) accept an optional `Idempotency-Key` header (one random id per
logical submission, reused on retries of that submission).

* Table `IdempotencyKey(businessId, key, operation, requestHash, responseStatus,
  responseBody, …)` with `UNIQUE (businessId, key)` — scoped per tenant, never
  global.
* The key row is inserted **in the same database transaction** as the record
  (`INSERT … ON CONFLICT DO NOTHING`). A concurrent duplicate blocks on the
  unique index until the first transaction finishes, then replays the stored
  response (`Idempotent-Replay: true`). If the first transaction rolls back, the
  second simply runs. There is no "in progress" state that a crash can leave
  stuck.
* Same key + different payload or operation → `409 IDEMPOTENCY_KEY_REUSED`.
* Business-rule failures roll back the key row, so the user can correct the
  input and retry with the same key.
* Keys expire after 48 h.
* The header is optional: installed Android apps do not send it and still work
  (just without replay protection).

## Alternatives
* Unique natural keys (e.g. client-generated bill ids): would require schema and
  client changes everywhere and does not cover payments.
* Status-polling after timeout: puts the burden on every client.

## Consequences
Retries are safe; duplicates are impossible when the header is sent. The check
costs one extra insert per financial create.
