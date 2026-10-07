# Business invariants

Rules that must be true of the data **at all times**, whichever code path wrote it
(a route, a script, a restore, a manual fix). Each one is checked by
`npm run audit:integrity` (read-only SQL in `scripts/lib/integrity-checks.mjs`) and
each check is proven to fail when its rule is broken: data rules by injecting the corruption
(`tests/integrity/integrity.test.ts`), database controls by removing the trigger, constraint or index
inside a rolled-back transaction, the orphan scan by simulating a restore with the foreign key unvalidated,
and the command-line wrapper's exit codes and `--json` output (`tests/integrity/integrity-extra.test.ts`).

Run it after restoring a backup, before and after a migration, after any manual
data fix, and weekly. It prints counts and row ids only — never names or amounts —
and exits 1 if any *error*-level rule is violated.

```
npm run audit:integrity                      # every business
npm run audit:integrity -- --business=<id>   # one business
npm run audit:integrity -- --json            # for a scheduled job
```

## Money

| Id | Rule | Level |
|---|---|---|
| `bill-paid-equals-payments` | `Bill.paidAmount` = sum of that bill's payments | error |
| `bill-status-matches-amounts` | status is UNPAID when paid ≤ 0, PAID when paid ≥ total, else PARTIAL | error |
| `bill-paid-within-total` | 0 ≤ paid ≤ total on every bill; every payment is > 0 | error |
| `bill-subtotal-equals-items` | normal bill: subtotal = sum of line amounts | error |
| `bill-item-amount` | line amount = ROUND(hours × rate, 2) | error |
| `bill-total-formula` | total = taxable + CGST + SGST + IGST (− diesel advance on direct bills); taxable = subtotal + charges − discount (direct bills: subtotal + transport) | error |
| `direct-bill-subtotal` | direct bill subtotal = bucket line + breaker line, each rounded | error |
| `bill-gst-amount` | GST bill: CGST + SGST = ROUND(taxable × rate / 100, 2); non-GST bill carries no tax | error |

All money is `NUMERIC(14,2)` and computed with exact decimals, ROUND_HALF_UP
(ADR-0001). The browser preview is a paise-integer mirror of the server's maths;
`tests/unit/money-property.test.ts` generates thousands of random bills and requires
the two to agree to the paisa. (Once, by hand, the preview's GST rounding was deliberately broken
and the property failed with a shrunk counter-example; that check is not automated.)

## Tenant isolation (data level)

A row may only point at rows of its own business. These catch a bug or a manual
edit that would otherwise leak one tenant's record into another's bill.

| Id | Rule |
|---|---|
| `payment-tenant` | payment.business = its bill's business |
| `bill-parents-tenant` | bill's customer, bank account and machine are in the bill's business |
| `bill-item-tenant` | bill line's machine and work record are in the bill's business |
| `work-session-tenant` | work record's machine, customer, site and operator are in its business |
| `operator-transaction-tenant` | operator money entry and its operator share a business |
| `operator-assignment-tenant` | a machine-operator assignment links a machine and an operator of its own business |
| `work-request-tenant` | an operator work request links a machine, operator and work record of its own business |
| `service-and-expense-tenant` | service records and machine expenses belong to the same business as their machine |
| `machine-current-links-tenant` | a machine's current operator and current site belong to the machine's business |
| `transaction-category-tenant` | an operator money entry uses a category of its own business |

## References the database does not protect

| Id | Rule | Level |
|---|---|---|
| `join-request-references` | `OperatorJoinRequest.operatorId` and `decidedBy` (no foreign key) point at an existing operator / user of the same business | error |
| `no-orphan-foreign-keys` | no row points at a missing parent, over **every** single-column foreign key read from the catalog (41 today; a new relation is covered automatically). The database normally makes this impossible; it can happen after a restore with constraints disabled or a bad manual fix | error |

## Work records

| Id | Rule | Level |
|---|---|---|
| `one-active-session-per-machine` | at most one ACTIVE work record per machine | error |
| `billed-session-completed` | a billed work record is COMPLETED | warn |
| `completed-session-shape` | COMPLETED has an end date, closing meter ≥ opening meter, hours ≥ 0 | warn |

"One work record is billed at most once" is enforced by the database itself
(`BillItem.workSessionId` is UNIQUE) and checked for presence below.

## Controls the database must still have

| Id | Control | Level |
|---|---|---|
| `control-audit-log-append-only` | `AuditLog` UPDATE/DELETE and TRUNCATE triggers exist | error |
| `control-check-constraints-present` | `Payment_amount_positive`, `Bill_paid_non_negative`, `Bill_paid_within_total` exist | error |
| `control-bill-item-session-unique` | unique index on `BillItem.workSessionId` exists | error |
| `control-check-constraints-validated` | the CHECK constraints are *validated* (they were added `NOT VALID`, which enforces new/updated rows only) | warn |
| `control-foreign-keys-validated` | every foreign key is validated (none left `NOT VALID` by a restore or manual change) | warn |

**Open item:** `control-check-constraints-validated` warns on the development database. All data currently
passes every rule above, so each constraint can be validated safely
(`ALTER TABLE "Payment" VALIDATE CONSTRAINT "Payment_amount_positive";` and likewise
for the two `Bill_*` constraints). It was deliberately *not* run automatically: it is
a schema change on live data and belongs in a reviewed migration or an explicit manual
step, after `npm run audit:integrity` has been run against production.

## Rules enforced when data is written (not re-checkable afterwards)

These are business rules the services enforce at write time. They are tested, but they cannot be
verified from a data snapshot, so `audit:integrity` does not check them.

| Rule | Where enforced | Test |
|---|---|---|
| A removed (archived) customer or bank account cannot be chosen for a **new** bill, work record or work-request approval (409 `CONFLICT`). Existing records that already use one stay editable, and completed work for a since-removed customer can still be billed from the work-record list, so history and revenue are never stranded (there is no "restore customer" action) | `src/lib/services/bills.ts`, `workSessions.ts`, `operatorWorkRequests.ts` | `tests/bills/archived-references.test.ts` |
| A bill has at most 1000 rows | `src/lib/validation/bill.ts` (`MAX_BILL_ROWS`) | `tests/bills/limits.test.ts` |
| A business cannot create more bills per day than its plan allows (`maxBillsPerDay`, set by support only) | `bills.ts` (`checkDailyBillLimit`) | `tests/bills/limits.test.ts` |
| Server-owned fields (tenant, totals, paid, status, version, archive flag, login/PIN fields, frozen, limits) cannot be set from a request body | request schemas + services | `tests/security/mass-assignment.test.ts`, a static guard in `tests/unit/route-inventory.test.ts` |
| Reordering machines and freezing/unfreezing a business are serialized per business, so two simultaneous requests cannot interleave into a mixed order or audit a stale "before" state | `lockBusiness` in `src/lib/tx.ts` | `tests/bills/concurrency-more.test.ts` |

## What this does not cover

* It checks consistency, not truth: a wrong rate typed by a person is consistent. Someone with the
  database credential can change data **and** its audit rows consistently; no check here can see that
  (see [assurance.md](assurance.md) §4).
* The state-transition rules covered are the three work-record rules and the bill status. Daily-log,
  work-request and join-request status transitions are not re-checked from data.
* The money property test (`tests/unit/money-property.test.ts`) was mutation-checked once by hand: the
  GST rounding in the browser preview was deliberately broken and the property failed with a shrunk
  counter-example. That check is not automated and is not reproducible from the repository.
* There is no cross-system reconciliation (bank statement ↔ payments) — payments are
  recorded by the owner, not imported.
* GST rules beyond the arithmetic (place of supply, HSN/SAC, invoice-number
  series rules, credit notes) are **not** validated here; have an accountant review
  the invoice format and GST handling before relying on it for filings.
