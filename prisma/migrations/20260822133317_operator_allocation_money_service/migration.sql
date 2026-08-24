-- DropIndex
DROP INDEX "SalaryPeriod_operatorId_idx";

-- DropIndex
DROP INDEX "SalaryPeriod_businessId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "SalaryPeriod";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "TransactionCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TransactionCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "maintenanceAlertThresholdHrs" REAL NOT NULL DEFAULT 50,
    "logoLeftUrl" TEXT,
    "logoRightUrl" TEXT,
    "signatureUrl" TEXT,
    "billTagline" TEXT,
    "billAccentColor" TEXT NOT NULL DEFAULT '#0B2B5E',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Business" ("address", "billAccentColor", "billTagline", "createdAt", "defaultServiceIntervalHrs", "gstNumber", "id", "logoLeftUrl", "logoRightUrl", "name", "ownerName", "phone", "signatureUrl", "updatedAt") SELECT "address", "billAccentColor", "billTagline", "createdAt", "defaultServiceIntervalHrs", "gstNumber", "id", "logoLeftUrl", "logoRightUrl", "name", "ownerName", "phone", "signatureUrl", "updatedAt" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE TABLE "new_DailyWorkLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workSessionId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "startTime" TEXT,
    "stopTime" TEXT,
    "breakMinutes" INTEGER,
    "startHourMeter" REAL,
    "endHourMeter" REAL,
    "hoursWorked" REAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ADMIN',
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyWorkLog_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DailyWorkLog" ("breakMinutes", "createdAt", "date", "endHourMeter", "hoursWorked", "id", "startHourMeter", "startTime", "stopTime", "workSessionId") SELECT "breakMinutes", "createdAt", "date", "endHourMeter", "hoursWorked", "id", "startHourMeter", "startTime", "stopTime", "workSessionId" FROM "DailyWorkLog";
DROP TABLE "DailyWorkLog";
ALTER TABLE "new_DailyWorkLog" RENAME TO "DailyWorkLog";
CREATE INDEX "DailyWorkLog_workSessionId_idx" ON "DailyWorkLog"("workSessionId");
CREATE INDEX "DailyWorkLog_date_idx" ON "DailyWorkLog"("date");
CREATE INDEX "DailyWorkLog_status_idx" ON "DailyWorkLog"("status");
CREATE TABLE "new_Operator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "address" TEXT,
    "joiningDate" DATETIME,
    "defaultMonthlySalary" REAL NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "pinHash" TEXT,
    "canLogin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Operator_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Operator" ("address", "businessId", "createdAt", "defaultMonthlySalary", "id", "isArchived", "joiningDate", "mobile", "name") SELECT "address", "businessId", "createdAt", "defaultMonthlySalary", "id", "isArchived", "joiningDate", "mobile", "name" FROM "Operator";
DROP TABLE "Operator";
ALTER TABLE "new_Operator" RENAME TO "Operator";
CREATE INDEX "Operator_businessId_idx" ON "Operator"("businessId");
CREATE INDEX "Operator_mobile_idx" ON "Operator"("mobile");
CREATE TABLE "new_OperatorTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "notes" TEXT,
    "deductFromSalary" BOOLEAN NOT NULL DEFAULT true,
    "businessEffect" TEXT NOT NULL DEFAULT 'ADVANCE_RECOVERABLE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperatorTransaction_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OperatorTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OperatorTransaction" ("amount", "businessId", "createdAt", "date", "id", "notes", "operatorId") SELECT "amount", "businessId", "createdAt", "date", "id", "notes", "operatorId" FROM "OperatorTransaction";
DROP TABLE "OperatorTransaction";
ALTER TABLE "new_OperatorTransaction" RENAME TO "OperatorTransaction";
CREATE INDEX "OperatorTransaction_businessId_idx" ON "OperatorTransaction"("businessId");
CREATE INDEX "OperatorTransaction_operatorId_idx" ON "OperatorTransaction"("operatorId");
CREATE INDEX "OperatorTransaction_categoryId_idx" ON "OperatorTransaction"("categoryId");
CREATE TABLE "new_ServiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "defaultIntervalHours" REAL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ServiceItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ServiceItem" ("businessId", "id", "isDefault", "name") SELECT "businessId", "id", "isDefault", "name" FROM "ServiceItem";
DROP TABLE "ServiceItem";
ALTER TABLE "new_ServiceItem" RENAME TO "ServiceItem";
CREATE INDEX "ServiceItem_businessId_idx" ON "ServiceItem"("businessId");
CREATE TABLE "new_ServiceRecordItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceRecordId" TEXT NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'Serviced',
    "done" BOOLEAN NOT NULL DEFAULT true,
    "cost" REAL NOT NULL DEFAULT 0,
    "brand" TEXT,
    "notes" TEXT,
    CONSTRAINT "ServiceRecordItem_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "ServiceRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceRecordItem_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ServiceRecordItem" ("done", "id", "notes", "serviceItemId", "serviceRecordId") SELECT "done", "id", "notes", "serviceItemId", "serviceRecordId" FROM "ServiceRecordItem";
DROP TABLE "ServiceRecordItem";
ALTER TABLE "new_ServiceRecordItem" RENAME TO "ServiceRecordItem";
CREATE INDEX "ServiceRecordItem_serviceRecordId_idx" ON "ServiceRecordItem"("serviceRecordId");
CREATE INDEX "ServiceRecordItem_serviceItemId_idx" ON "ServiceRecordItem"("serviceItemId");
CREATE TABLE "new_WorkSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "customerId" TEXT,
    "siteId" TEXT,
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
CREATE INDEX "TransactionCategory_businessId_idx" ON "TransactionCategory"("businessId");

