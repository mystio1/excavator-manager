-- Database backstops for rules the application already enforces under row locks.
-- Each guard aborts with a clear message (instead of failing obscurely or
-- silently skipping) if existing data already violates the rule, so a human
-- decides how to resolve it. Nothing is deleted or rewritten.

-- 1. One live reading per work session per day. Rejected readings may repeat the
--    date (the operator resubmits), so the index only covers APPROVED/PENDING.
DO $$
DECLARE
  dup bigint;
BEGIN
  SELECT count(*) INTO dup FROM (
    SELECT "workSessionId", "date" FROM "DailyWorkLog"
    WHERE "status" IN ('APPROVED', 'PENDING')
    GROUP BY "workSessionId", "date" HAVING count(*) > 1
  ) d;
  IF dup > 0 THEN
    RAISE EXCEPTION 'integrity_indexes migration aborted: % work session day(s) have more than one APPROVED/PENDING reading. Find them with: SELECT "workSessionId","date",array_agg(id) FROM "DailyWorkLog" WHERE "status" IN (''APPROVED'',''PENDING'') GROUP BY 1,2 HAVING count(*) > 1; then reject or delete the duplicate and re-run.', dup;
  END IF;
END $$;

CREATE UNIQUE INDEX "DailyWorkLog_session_date_live_key"
  ON "DailyWorkLog" ("workSessionId", "date")
  WHERE "status" IN ('APPROVED', 'PENDING');

-- 2. At most one pending join request per business + mobile number.
DO $$
DECLARE
  dup bigint;
BEGIN
  SELECT count(*) INTO dup FROM (
    SELECT "businessId", "mobile" FROM "OperatorJoinRequest"
    WHERE "status" = 'PENDING'
    GROUP BY "businessId", "mobile" HAVING count(*) > 1
  ) d;
  IF dup > 0 THEN
    RAISE EXCEPTION 'integrity_indexes migration aborted: % business/mobile pair(s) have more than one PENDING join request. Decline the duplicates and re-run.', dup;
  END IF;
END $$;

CREATE UNIQUE INDEX "OperatorJoinRequest_pending_mobile_key"
  ON "OperatorJoinRequest" ("businessId", "mobile")
  WHERE "status" = 'PENDING';

-- 3. Password-reset links look the user up by the token hash.
CREATE INDEX "User_resetTokenHash_idx" ON "User"("resetTokenHash");
