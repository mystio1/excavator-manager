# ADR-0001: Money is NUMERIC / Decimal, never floating point

Status: accepted

## Context
Money (bill totals, GST, payments, operator advances/salary, service costs) was
stored as `DOUBLE PRECISION` (Prisma `Float`) and computed with JS numbers and a
`round2` helper. Binary floats cannot represent most decimal fractions exactly,
sums of payments drift (`0.1 + 0.2`), and `paidAmount >= total - 0.01`
comparisons hid the problem rather than fixing it.

## Decision
* Every money amount and every **billed quantity** is `NUMERIC` in Postgres:
  `DECIMAL(14,2)` for amounts and rates, `DECIMAL(10,2)` for billed hours/litres,
  `DECIMAL(5,2)` for GST percentage. In TypeScript they are `Prisma.Decimal`
  (decimal.js).
* All arithmetic goes through `src/lib/money.ts`; rounding is
  ROUND_HALF_UP to 2 dp at each step a stored/printed amount is produced.
  GST: `tax = round2(taxable × rate / 100)`, `CGST = round2(tax / 2)`,
  `SGST = tax − CGST` so CGST + SGST equals tax exactly.
* Hours/meter readings on work sessions, daily logs and machines are
  *measurements*, not money, and stay `Float`; they are rounded to 2 dp at write
  time and converted when they enter a billing calculation.
* JSON responses serialize Decimals as plain numbers (a `toJSON` patch in
  `money.ts`; safe because `NUMERIC(14,2)` has ≤ 12 integer digits, far inside a
  double's exact-integer range). Client types use `Plain<T>`.
* Integer paise was considered: it keeps `number` types, but would force a unit
  conversion at every API boundary and in every form. Decimal changes types
  once, at the service boundary, and TypeScript found every call site.

## Migration (staged, non-destructive)
`20261004090000_money_decimal` first **verifies** that every existing value is
already a 2-decimal number (within 1e-6 float noise). If any row is not, the
migration aborts with the table, column and count — it never silently rounds a
financial value. Then it converts the columns `USING round(col::numeric, 2)`
inside one transaction. `scripts/test-migrations.mjs` proves both paths on
scratch schemas (values preserved exactly; abort leaves data untouched).

## Consequences
* Exact, deterministic totals and balances.
* A small rewrite of services/dashboard code; no UI changes.
* Anything that must stay a plain number in the browser is converted at the
  API boundary; never import `money.ts` into client code (lint-enforced).
