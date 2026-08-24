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
    "defaultServiceIntervalHrs" REAL NOT NULL DEFAULT 350,
    "logoLeftUrl" TEXT,
    "logoRightUrl" TEXT,
    "signatureUrl" TEXT,
    "billTagline" TEXT,
    "billAccentColor" TEXT NOT NULL DEFAULT '#0B2B5E',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Business" ("address", "billAccentColor", "createdAt", "defaultServiceIntervalHrs", "gstNumber", "id", "logoLeftUrl", "logoRightUrl", "name", "ownerName", "phone", "signatureUrl", "updatedAt") SELECT "address", "billAccentColor", "createdAt", "defaultServiceIntervalHrs", "gstNumber", "id", "logoLeftUrl", "logoRightUrl", "name", "ownerName", "phone", "signatureUrl", "updatedAt" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
