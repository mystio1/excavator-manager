-- AlterTable
ALTER TABLE "DailyWorkLog" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'WORK';

-- AlterTable
ALTER TABLE "OperatorTransaction" ADD COLUMN     "workingPeriodId" TEXT;

-- AlterTable
ALTER TABLE "OperatorWorkRequest" ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "breakerRate" DECIMAL(14,2),
ADD COLUMN     "bucketRate" DECIMAL(14,2),
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'CUSTOMER_SITE',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SiteRateHistory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "bucketRate" DECIMAL(14,2),
    "breakerRate" DECIMAL(14,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteRateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorWorkingPeriod" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "businessId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "monthlySalary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "salaryBasisDays" INTEGER NOT NULL DEFAULT 30,
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "openingSourcePeriodId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "OperatorWorkingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorLeave" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'UNPAID',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorLeave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteRateHistory_businessId_idx" ON "SiteRateHistory"("businessId");

-- CreateIndex
CREATE INDEX "SiteRateHistory_siteId_effectiveFrom_idx" ON "SiteRateHistory"("siteId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorWorkingPeriod_openingSourcePeriodId_key" ON "OperatorWorkingPeriod"("openingSourcePeriodId");

-- CreateIndex
CREATE INDEX "OperatorWorkingPeriod_businessId_idx" ON "OperatorWorkingPeriod"("businessId");

-- CreateIndex
CREATE INDEX "OperatorWorkingPeriod_operatorId_startDate_idx" ON "OperatorWorkingPeriod"("operatorId", "startDate");

-- CreateIndex
CREATE INDEX "OperatorLeave_businessId_idx" ON "OperatorLeave"("businessId");

-- CreateIndex
CREATE INDEX "OperatorLeave_operatorId_startDate_idx" ON "OperatorLeave"("operatorId", "startDate");

-- CreateIndex
CREATE INDEX "Site_customerId_idx" ON "Site"("customerId");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteRateHistory" ADD CONSTRAINT "SiteRateHistory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorWorkingPeriod" ADD CONSTRAINT "OperatorWorkingPeriod_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorWorkingPeriod" ADD CONSTRAINT "OperatorWorkingPeriod_openingSourcePeriodId_fkey" FOREIGN KEY ("openingSourcePeriodId") REFERENCES "OperatorWorkingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorLeave" ADD CONSTRAINT "OperatorLeave_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One ACTIVE working period per operator, and a period must end on/after it starts.
CREATE UNIQUE INDEX "OperatorWorkingPeriod_one_active_per_operator" ON "OperatorWorkingPeriod"("operatorId") WHERE "status" = 'ACTIVE';
ALTER TABLE "OperatorWorkingPeriod" ADD CONSTRAINT "OperatorWorkingPeriod_dates_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate") NOT VALID;
ALTER TABLE "OperatorWorkingPeriod" ADD CONSTRAINT "OperatorWorkingPeriod_status_check" CHECK ("status" IN ('ACTIVE','CLOSED')) NOT VALID;
ALTER TABLE "OperatorLeave" ADD CONSTRAINT "OperatorLeave_dates_check" CHECK ("endDate" >= "startDate") NOT VALID;
ALTER TABLE "OperatorLeave" ADD CONSTRAINT "OperatorLeave_type_check" CHECK ("type" IN ('UNPAID','PAID')) NOT VALID;
ALTER TABLE "Site" ADD CONSTRAINT "Site_type_check" CHECK ("type" IN ('CUSTOMER_SITE','SELF_SITE')) NOT VALID;
ALTER TABLE "Site" ADD CONSTRAINT "Site_status_check" CHECK ("status" IN ('ACTIVE','COMPLETED','ON_HOLD')) NOT VALID;
ALTER TABLE "DailyWorkLog" ADD CONSTRAINT "DailyWorkLog_kind_check" CHECK ("kind" IN ('WORK','DIESEL_ONLY')) NOT VALID;

-- Backfill: every existing operator gets ONE initial working period from the joining date (or the date the
-- record was created) with today's monthly salary, so salary keeps being computed exactly as before.
-- Existing salary/payment rows are not touched.
INSERT INTO "OperatorWorkingPeriod" ("id", "businessId", "operatorId", "startDate", "status", "monthlySalary", "salaryBasisDays", "openingBalance", "createdAt")
SELECT 'wp' || substr(md5(o."id" || 'initial-period'), 1, 22), o."businessId", o."id", COALESCE(o."joiningDate", o."createdAt"), 'ACTIVE', o."defaultMonthlySalary", 30, 0, CURRENT_TIMESTAMP
FROM "Operator" o
WHERE NOT EXISTS (SELECT 1 FROM "OperatorWorkingPeriod" p WHERE p."operatorId" = o."id");
