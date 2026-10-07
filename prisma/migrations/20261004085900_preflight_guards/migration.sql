-- PRE-FLIGHT: read-only checks for the three migrations that follow.
--
-- This migration changes NOTHING. It runs first and refuses to continue if the
-- existing data would make any of the next migrations abort half-way, so the
-- database is never left partly migrated (money columns converted but the
-- security migration failed, and similar). Every problem found is reported in
-- ONE message, not just the first.
--
-- If it aborts: nothing was modified. Fix the rows it lists, then
--   npx prisma migrate resolve --rolled-back 20261004085900_preflight_guards
--   npx prisma migrate deploy
-- (Prisma records a failed migration and refuses to continue until it is
-- marked rolled back.) See docs/runbook-recovery.md §3B.

DO $$
DECLARE
  problems text[] := ARRAY[]::text[];
  t record;
  n bigint;
BEGIN
  -- 1. Money / billed-quantity columns must already be 2-decimal values (float noise
  --    up to 1e-6 is fine). The money migration never rounds a real value silently.
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
    ) INTO n;
    IF n > 0 THEN
      problems := problems || format('%s.%s has %s value(s) with more than 2 decimal places (list them: SELECT id, %I FROM %I WHERE %I IS NOT NULL AND abs(%I::numeric - round(%I::numeric, 2)) > 0.000001)',
        t.tbl, t.col, n, t.col, t.tbl, t.col, t.col, t.col);
    END IF;
  END LOOP;

  -- 2. A work session billed more than once (BillItem.workSessionId becomes UNIQUE).
  SELECT count(*) INTO n FROM (
    SELECT "workSessionId" FROM "BillItem" WHERE "workSessionId" IS NOT NULL
    GROUP BY "workSessionId" HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    problems := problems || format('%s work session(s) are billed more than once (SELECT "workSessionId", array_agg("billId") FROM "BillItem" WHERE "workSessionId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1)', n);
  END IF;

  -- 3. More than one live (APPROVED/PENDING) reading for the same work session day.
  SELECT count(*) INTO n FROM (
    SELECT "workSessionId", "date" FROM "DailyWorkLog"
    WHERE "status" IN ('APPROVED', 'PENDING')
    GROUP BY "workSessionId", "date" HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    problems := problems || format('%s work session day(s) have more than one APPROVED/PENDING reading (SELECT "workSessionId","date",array_agg(id) FROM "DailyWorkLog" WHERE "status" IN (''APPROVED'',''PENDING'') GROUP BY 1,2 HAVING count(*) > 1)', n);
  END IF;

  -- 4. Legacy pending join requests (operators with a PIN but canLogin = false) that
  --    share a business + mobile: they would become duplicate PENDING requests.
  SELECT count(*) INTO n FROM (
    SELECT "businessId", "mobile" FROM "Operator"
    WHERE "pinHash" IS NOT NULL AND "canLogin" = false AND "isArchived" = false
    GROUP BY "businessId", "mobile" HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    problems := problems || format('%s business/mobile pair(s) have more than one pending legacy join request (archive or delete the duplicates)', n);
  END IF;

  IF array_length(problems, 1) > 0 THEN
    RAISE EXCEPTION E'preflight_guards: existing data would make the next migrations abort. Nothing has been changed. Fix these first:\n - %',
      array_to_string(problems, E'\n - ');
  END IF;
END $$;
