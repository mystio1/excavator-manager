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
    "operatorLanguage" TEXT NOT NULL DEFAULT 'en',
    "logoLeftUrl" TEXT,
    "logoRightUrl" TEXT,
    "signatureUrl" TEXT,
    "billTagline" TEXT,
    "billAccentColor" TEXT NOT NULL DEFAULT '#0B2B5E',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Business" ("address", "billAccentColor", "billTagline", "code", "createdAt", "defaultServiceIntervalHrs", "gstNumber", "id", "logoLeftUrl", "logoRightUrl", "maintenanceAlertThresholdHrs", "name", "ownerName", "phone", "signatureUrl", "updatedAt") SELECT "address", "billAccentColor", "billTagline", "code", "createdAt", "defaultServiceIntervalHrs", "gstNumber", "id", "logoLeftUrl", "logoRightUrl", "maintenanceAlertThresholdHrs", "name", "ownerName", "phone", "signatureUrl", "updatedAt" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_code_key" ON "Business"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
