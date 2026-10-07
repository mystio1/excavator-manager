-- Money precision: DOUBLE PRECISION -> NUMERIC.
--
-- Every money amount and every billed quantity becomes an exact decimal.
-- Hours/meter readings on work sessions, daily logs and machines are
-- measurements, not money, and intentionally stay DOUBLE PRECISION (they are
-- rounded to 2 dp at write time).
--
-- SAFETY: this migration never silently rewrites a value. Before converting
-- anything it checks that every existing value is already a 2-decimal number
-- (within float noise, 1e-6). If any row is not, the migration ABORTS with the
-- table/column and a count so a human can review those rows first. Aborting is
-- safe: nothing has been changed yet (the whole file runs in one transaction),
-- and `prisma migrate deploy` failing on Render leaves the previous release
-- running.
--
-- (The same checks, for ALL columns and for the other migrations in this series,
-- already ran in 20261004085900_preflight_guards, so this guard should never fire;
-- it stays as a second line of defense.)
--
-- LOCKING: ALTER COLUMN TYPE takes an ACCESS EXCLUSIVE lock on each table. lock_timeout
-- makes the migration give up (and abort cleanly, changing nothing) instead of queuing
-- behind a long-running transaction and blocking every request behind it. If it times
-- out, simply redeploy a moment later.
SET LOCAL lock_timeout = '20s';

-- Pre-flight query for a single column (replace table/column):
--   SELECT id, "<col>" FROM "<Table>"
--   WHERE "<col>" IS NOT NULL AND abs("<col>"::numeric - round("<col>"::numeric, 2)) > 0.000001;

DO $$
DECLARE
  t record;
  bad bigint;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('Bill', 'subtotal'), ('Bill', 'transportCharges'), ('Bill', 'fuelCharges'),
      ('Bill', 'extraCharges'), ('Bill', 'bucketCharge'), ('Bill', 'breakerCharge'),
      ('Bill', 'discount'), ('Bill', 'gstPercentage'), ('Bill', 'cgst'), ('Bill', 'sgst'),
      ('Bill', 'igst'), ('Bill', 'totalAmount'), ('Bill', 'paidAmount'),
      ('Bill', 'bucketHours'), ('Bill', 'bucketRate'), ('Bill', 'breakerHours'),
      ('Bill', 'breakerRate'), ('Bill', 'dieselLiters'), ('Bill', 'dieselPricePerLiter'),
      ('Bill', 'dieselAdvance'),
      ('BillItem', 'hours'), ('BillItem', 'ratePerHour'), ('BillItem', 'amount'),
      ('Payment', 'amount'),
      ('OperatorTransaction', 'amount'),
      ('Operator', 'defaultMonthlySalary'),
      ('ServiceRecord', 'cost'), ('ServiceRecordItem', 'cost'),
      ('ExcavatorExpense', 'amount')
    ) AS v(tbl, col)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE %I IS NOT NULL AND abs(%I::numeric - round(%I::numeric, 2)) > 0.000001',
      t.tbl, t.col, t.col, t.col
    ) INTO bad;
    IF bad > 0 THEN
      RAISE EXCEPTION 'money_decimal migration aborted: %.% has % value(s) with more than 2 decimal places. Review them (see the pre-flight query at the top of this file) before migrating.',
        t.tbl, t.col, bad;
    END IF;
  END LOOP;
END $$;

-- AlterTable
ALTER TABLE "Bill"
  ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(14,2) USING round("subtotal"::numeric, 2),
  ALTER COLUMN "transportCharges" SET DATA TYPE DECIMAL(14,2) USING round("transportCharges"::numeric, 2),
  ALTER COLUMN "fuelCharges" SET DATA TYPE DECIMAL(14,2) USING round("fuelCharges"::numeric, 2),
  ALTER COLUMN "extraCharges" SET DATA TYPE DECIMAL(14,2) USING round("extraCharges"::numeric, 2),
  ALTER COLUMN "bucketCharge" SET DATA TYPE DECIMAL(14,2) USING round("bucketCharge"::numeric, 2),
  ALTER COLUMN "breakerCharge" SET DATA TYPE DECIMAL(14,2) USING round("breakerCharge"::numeric, 2),
  ALTER COLUMN "discount" SET DATA TYPE DECIMAL(14,2) USING round("discount"::numeric, 2),
  ALTER COLUMN "gstPercentage" SET DATA TYPE DECIMAL(5,2) USING round("gstPercentage"::numeric, 2),
  ALTER COLUMN "cgst" SET DATA TYPE DECIMAL(14,2) USING round("cgst"::numeric, 2),
  ALTER COLUMN "sgst" SET DATA TYPE DECIMAL(14,2) USING round("sgst"::numeric, 2),
  ALTER COLUMN "igst" SET DATA TYPE DECIMAL(14,2) USING round("igst"::numeric, 2),
  ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(14,2) USING round("totalAmount"::numeric, 2),
  ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(14,2) USING round("paidAmount"::numeric, 2),
  ALTER COLUMN "bucketHours" SET DATA TYPE DECIMAL(10,2) USING round("bucketHours"::numeric, 2),
  ALTER COLUMN "bucketRate" SET DATA TYPE DECIMAL(14,2) USING round("bucketRate"::numeric, 2),
  ALTER COLUMN "breakerHours" SET DATA TYPE DECIMAL(10,2) USING round("breakerHours"::numeric, 2),
  ALTER COLUMN "breakerRate" SET DATA TYPE DECIMAL(14,2) USING round("breakerRate"::numeric, 2),
  ALTER COLUMN "dieselLiters" SET DATA TYPE DECIMAL(10,2) USING round("dieselLiters"::numeric, 2),
  ALTER COLUMN "dieselPricePerLiter" SET DATA TYPE DECIMAL(14,2) USING round("dieselPricePerLiter"::numeric, 2),
  ALTER COLUMN "dieselAdvance" SET DATA TYPE DECIMAL(14,2) USING round("dieselAdvance"::numeric, 2);

-- AlterTable
ALTER TABLE "BillItem"
  ALTER COLUMN "hours" SET DATA TYPE DECIMAL(10,2) USING round("hours"::numeric, 2),
  ALTER COLUMN "ratePerHour" SET DATA TYPE DECIMAL(14,2) USING round("ratePerHour"::numeric, 2),
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2) USING round("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "Payment"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2) USING round("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "OperatorTransaction"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2) USING round("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "Operator"
  ALTER COLUMN "defaultMonthlySalary" DROP DEFAULT,
  ALTER COLUMN "defaultMonthlySalary" SET DATA TYPE DECIMAL(14,2) USING round("defaultMonthlySalary"::numeric, 2),
  ALTER COLUMN "defaultMonthlySalary" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "ServiceRecord"
  ALTER COLUMN "cost" DROP DEFAULT,
  ALTER COLUMN "cost" SET DATA TYPE DECIMAL(14,2) USING round("cost"::numeric, 2),
  ALTER COLUMN "cost" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "ServiceRecordItem"
  ALTER COLUMN "cost" DROP DEFAULT,
  ALTER COLUMN "cost" SET DATA TYPE DECIMAL(14,2) USING round("cost"::numeric, 2),
  ALTER COLUMN "cost" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "ExcavatorExpense"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2) USING round("amount"::numeric, 2);

-- Bill money columns that carry a DEFAULT 0 keep it across the type change
-- (Postgres preserves defaults when the new type accepts them); the explicit
-- DROP/SET DEFAULT above is only needed for the float -> numeric default cast
-- on the columns that previously had one.
