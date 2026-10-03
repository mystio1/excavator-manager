-- AlterTable
ALTER TABLE "Excavator" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: keep the current (oldest-first) order per business
UPDATE "Excavator" e
SET "sortOrder" = r.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "businessId" ORDER BY "createdAt" ASC) AS rn
  FROM "Excavator"
) r
WHERE e.id = r.id;
