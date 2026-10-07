# ADR-0006: Optimistic concurrency and an append-only audit trail

Status: accepted

## Context
Bills, payments, work records and readings became editable and deletable
(owners fix mistakes). Two people (or two tabs) could silently overwrite each
other, and there was no record of who changed a financial figure or when.

## Decision
* **Optimistic concurrency.** `version INT` on Bill, Payment, WorkSession,
  DailyWorkLog, OperatorTransaction, Customer, Excavator, Operator. PATCH bodies
  carry `expectedVersion`; inside the transaction the row is locked/read and a
  mismatch returns `409 RESOURCE_MODIFIED` instead of overwriting. Every write
  (including side effects such as recomputed totals) increments `version`.
  `expectedVersion` is optional so old apps keep working (they skip the check).
* **Audit trail.** `AuditLog` rows (actor type/id, action, entity type/id,
  before/after JSON snapshots with secrets stripped, reason, request id) are
  written **in the same transaction** as the change they describe, so a change
  cannot commit without its audit entry. The table is **append-only at the
  database level** (trigger blocks UPDATE/DELETE/TRUNCATE; a per-transaction
  setting lets tests and deliberate maintenance purge).
* **Payments** lock the bill row, recompute `paidAmount` as the exact sum of
  Payment rows, and are protected by CHECK constraints (`amount > 0`,
  `paidAmount <= totalAmount`, added `NOT VALID` so legacy rows are not
  retro-rejected).
* **One work session, one bill**: `BillItem.workSessionId` UNIQUE.

## Consequences
Lost updates and double billing are impossible to commit; every financial edit
is attributable. The audit table grows with usage (plan retention/archival
before it becomes large).
