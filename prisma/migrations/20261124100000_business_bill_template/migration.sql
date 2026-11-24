-- Which layout bills are shown / printed / shared in: 'STANDARD' (machine-wise lines) or
-- 'DAILY_SUMMARY' (one row per working day with meter readings, type and diesel). Chosen from the
-- Bills tab. IF NOT EXISTS so a re-run against a database that already has it is harmless.
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "billTemplate" TEXT NOT NULL DEFAULT 'STANDARD';
