-- CreateTable
CREATE TABLE "OperatorAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperatorAssignment_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperatorAssignment_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Data migration: WorkSession.customerId/siteId are becoming required again
-- (the "Allocate Machine with no job yet" case is moving to a dedicated
-- OperatorAssignment record, decoupled from daily job start/stop). Any
-- existing WorkSession row with no customer/site was exactly that old-style
-- allocation placeholder — preserve it as assignment history instead of
-- losing it, then remove it from WorkSession so the NOT NULL backfill below
-- doesn't reject it.
INSERT INTO "OperatorAssignment" ("id", "businessId", "excavatorId", "operatorId", "startDate", "endDate", "status", "createdAt")
SELECT 'legacy-' || lower(hex(randomblob(12))), "businessId", "excavatorId", "operatorId", "startDate",
       CASE WHEN "status" = 'COMPLETED' THEN COALESCE("endDate", "startDate") ELSE NULL END,
       CASE WHEN "status" = 'COMPLETED' THEN 'ENDED' ELSE 'ACTIVE' END,
       "createdAt"
FROM "WorkSession"
WHERE "customerId" IS NULL OR "siteId" IS NULL;

DELETE FROM "WorkSession" WHERE "customerId" IS NULL OR "siteId" IS NULL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Excavator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machineNumber" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "purchaseDate" DATETIME,
    "startingHourMeter" REAL NOT NULL DEFAULT 0,
    "currentHourMeter" REAL NOT NULL DEFAULT 0,
    "serviceIntervalHrs" REAL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "currentOperatorId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Excavator_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Excavator_currentOperatorId_fkey" FOREIGN KEY ("currentOperatorId") REFERENCES "Operator" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Excavator" ("brand", "businessId", "createdAt", "currentHourMeter", "id", "isArchived", "machineNumber", "model", "name", "purchaseDate", "serviceIntervalHrs", "startingHourMeter", "status", "updatedAt") SELECT "brand", "businessId", "createdAt", "currentHourMeter", "id", "isArchived", "machineNumber", "model", "name", "purchaseDate", "serviceIntervalHrs", "startingHourMeter", "status", "updatedAt" FROM "Excavator";
DROP TABLE "Excavator";
ALTER TABLE "new_Excavator" RENAME TO "Excavator";
CREATE INDEX "Excavator_businessId_idx" ON "Excavator"("businessId");
CREATE INDEX "Excavator_businessId_status_idx" ON "Excavator"("businessId", "status");
CREATE INDEX "Excavator_currentOperatorId_idx" ON "Excavator"("currentOperatorId");
CREATE TABLE "new_WorkSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "startHourMeter" REAL NOT NULL,
    "endHourMeter" REAL,
    "totalHours" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkSession_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkSession_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkSession_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_WorkSession" ("businessId", "createdAt", "customerId", "endDate", "endHourMeter", "excavatorId", "id", "notes", "operatorId", "siteId", "startDate", "startHourMeter", "status", "totalHours", "updatedAt") SELECT "businessId", "createdAt", "customerId", "endDate", "endHourMeter", "excavatorId", "id", "notes", "operatorId", "siteId", "startDate", "startHourMeter", "status", "totalHours", "updatedAt" FROM "WorkSession";
DROP TABLE "WorkSession";
ALTER TABLE "new_WorkSession" RENAME TO "WorkSession";
CREATE INDEX "WorkSession_businessId_idx" ON "WorkSession"("businessId");
CREATE INDEX "WorkSession_excavatorId_idx" ON "WorkSession"("excavatorId");
CREATE INDEX "WorkSession_customerId_idx" ON "WorkSession"("customerId");
CREATE INDEX "WorkSession_operatorId_idx" ON "WorkSession"("operatorId");
CREATE INDEX "WorkSession_businessId_status_idx" ON "WorkSession"("businessId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "OperatorAssignment_businessId_idx" ON "OperatorAssignment"("businessId");

-- CreateIndex
CREATE INDEX "OperatorAssignment_excavatorId_idx" ON "OperatorAssignment"("excavatorId");

-- CreateIndex
CREATE INDEX "OperatorAssignment_operatorId_idx" ON "OperatorAssignment"("operatorId");
