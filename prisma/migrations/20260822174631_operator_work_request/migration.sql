-- CreateTable
CREATE TABLE "OperatorWorkRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "startHourMeter" REAL NOT NULL,
    "endDate" DATETIME,
    "endHourMeter" REAL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "rejectionNote" TEXT,
    "workSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    CONSTRAINT "OperatorWorkRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperatorWorkRequest_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperatorWorkRequest_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperatorWorkRequest_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatorWorkRequest_workSessionId_key" ON "OperatorWorkRequest"("workSessionId");

-- CreateIndex
CREATE INDEX "OperatorWorkRequest_businessId_idx" ON "OperatorWorkRequest"("businessId");

-- CreateIndex
CREATE INDEX "OperatorWorkRequest_excavatorId_idx" ON "OperatorWorkRequest"("excavatorId");

-- CreateIndex
CREATE INDEX "OperatorWorkRequest_operatorId_idx" ON "OperatorWorkRequest"("operatorId");

