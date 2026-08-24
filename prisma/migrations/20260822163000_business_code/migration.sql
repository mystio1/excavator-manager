-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "gstNumber" TEXT,
    "code" TEXT NOT NULL,
    "defaultServiceIntervalHrs" REAL NOT NULL DEFAULT 350,
    "maintenanceAlertThresholdHrs" REAL NOT NULL DEFAULT 50,
    "logoLeftUrl" TEXT,
    "logoRightUrl" TEXT,
    "signatureUrl" TEXT,
    "billTagline" TEXT,
    "billAccentColor" TEXT NOT NULL DEFAULT '#0B2B5E',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
-- Every existing business gets a one-off generated code so the NOT NULL
-- backfill never collides — 'Y56SFB' was pre-generated for the single real
-- business row at the time this migration was authored. Any additional
-- pre-existing rows (none expected) get a randomized fallback derived from
-- their own id so the UNIQUE constraint still holds.
INSERT INTO "new_Business" ("address", "billAccentColor", "billTagline", "code", "createdAt", "defaultServiceIntervalHrs", "gstNumber", "id", "logoLeftUrl", "logoRightUrl", "maintenanceAlertThresholdHrs", "name", "ownerName", "phone", "signatureUrl", "updatedAt")
SELECT "address", "billAccentColor", "billTagline",
       CASE WHEN (SELECT COUNT(*) FROM "Business") = 1 THEN 'Y56SFB' ELSE upper(substr(replace(hex(randomblob(8)), '0', 'A'), 1, 6)) END,
       "createdAt", "defaultServiceIntervalHrs", "gstNumber", "id", "logoLeftUrl", "logoRightUrl", "maintenanceAlertThresholdHrs", "name", "ownerName", "phone", "signatureUrl", "updatedAt"
FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_code_key" ON "Business"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
