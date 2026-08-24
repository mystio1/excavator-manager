-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Excavator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machineNumber" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "purchaseDate" DATETIME,
    "startingHourMeter" REAL NOT NULL DEFAULT 0,
    "currentHourMeter" REAL NOT NULL DEFAULT 0,
    "serviceIntervalHrs" REAL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "currentOperatorId" TEXT,
    "currentSiteId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Excavator_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Excavator_currentOperatorId_fkey" FOREIGN KEY ("currentOperatorId") REFERENCES "Operator" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Excavator_currentSiteId_fkey" FOREIGN KEY ("currentSiteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Excavator" ("brand", "businessId", "createdAt", "currentHourMeter", "currentOperatorId", "currentSiteId", "id", "isArchived", "machineNumber", "model", "name", "purchaseDate", "serviceIntervalHrs", "startingHourMeter", "status", "updatedAt") SELECT "brand", "businessId", "createdAt", "currentHourMeter", "currentOperatorId", "currentSiteId", "id", "isArchived", "machineNumber", "model", "name", "purchaseDate", "serviceIntervalHrs", "startingHourMeter", "status", "updatedAt" FROM "Excavator";
DROP TABLE "Excavator";
ALTER TABLE "new_Excavator" RENAME TO "Excavator";
CREATE INDEX "Excavator_businessId_idx" ON "Excavator"("businessId");
CREATE INDEX "Excavator_businessId_status_idx" ON "Excavator"("businessId", "status");
CREATE INDEX "Excavator_currentOperatorId_idx" ON "Excavator"("currentOperatorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
