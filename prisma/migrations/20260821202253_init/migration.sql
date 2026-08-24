-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "gstNumber" TEXT,
    "defaultServiceIntervalHrs" REAL NOT NULL DEFAULT 350,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Excavator" (
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
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Excavator_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Site_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "companyName" TEXT,
    "address" TEXT,
    "gstNumber" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "address" TEXT,
    "joiningDate" DATETIME,
    "defaultMonthlySalary" REAL NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Operator_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkSession" (
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

-- CreateTable
CREATE TABLE "DailyWorkLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workSessionId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "startTime" TEXT,
    "stopTime" TEXT,
    "breakMinutes" INTEGER,
    "startHourMeter" REAL,
    "endHourMeter" REAL,
    "hoursWorked" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyWorkLog_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalaryPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "baseSalary" REAL NOT NULL,
    "bonus" REAL NOT NULL DEFAULT 0,
    "extraPayment" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalaryPeriod_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperatorTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "salaryPeriodId" TEXT,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "reason" TEXT,
    "date" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperatorTransaction_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OperatorTransaction_salaryPeriodId_fkey" FOREIGN KEY ("salaryPeriodId") REFERENCES "SalaryPeriod" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ServiceItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "serviceDate" DATETIME NOT NULL,
    "hourMeterAtService" REAL NOT NULL,
    "serviceType" TEXT,
    "cost" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "nextServiceDueHour" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceRecord_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceRecordItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceRecordId" TEXT NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    CONSTRAINT "ServiceRecordItem_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "ServiceRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceRecordItem_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExcavatorExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExcavatorExpense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExcavatorExpense_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BillNumberSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BillNumberSequence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "billType" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "billDate" DATETIME NOT NULL,
    "subtotal" REAL NOT NULL,
    "transportCharges" REAL NOT NULL DEFAULT 0,
    "fuelCharges" REAL NOT NULL DEFAULT 0,
    "extraCharges" REAL NOT NULL DEFAULT 0,
    "discount" REAL NOT NULL DEFAULT 0,
    "gstPercentage" REAL,
    "cgst" REAL,
    "sgst" REAL,
    "igst" REAL,
    "totalAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bill_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bill_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BillItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "workSessionId" TEXT,
    "fromDate" DATETIME NOT NULL,
    "toDate" DATETIME NOT NULL,
    "hours" REAL NOT NULL,
    "ratePerHour" REAL NOT NULL,
    "amount" REAL NOT NULL,
    CONSTRAINT "BillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillItem_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BillItem_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_businessId_idx" ON "User"("businessId");

-- CreateIndex
CREATE INDEX "Excavator_businessId_idx" ON "Excavator"("businessId");

-- CreateIndex
CREATE INDEX "Excavator_businessId_status_idx" ON "Excavator"("businessId", "status");

-- CreateIndex
CREATE INDEX "Site_businessId_idx" ON "Site"("businessId");

-- CreateIndex
CREATE INDEX "Customer_businessId_idx" ON "Customer"("businessId");

-- CreateIndex
CREATE INDEX "Operator_businessId_idx" ON "Operator"("businessId");

-- CreateIndex
CREATE INDEX "WorkSession_businessId_idx" ON "WorkSession"("businessId");

-- CreateIndex
CREATE INDEX "WorkSession_excavatorId_idx" ON "WorkSession"("excavatorId");

-- CreateIndex
CREATE INDEX "WorkSession_customerId_idx" ON "WorkSession"("customerId");

-- CreateIndex
CREATE INDEX "WorkSession_operatorId_idx" ON "WorkSession"("operatorId");

-- CreateIndex
CREATE INDEX "WorkSession_businessId_status_idx" ON "WorkSession"("businessId", "status");

-- CreateIndex
CREATE INDEX "DailyWorkLog_workSessionId_idx" ON "DailyWorkLog"("workSessionId");

-- CreateIndex
CREATE INDEX "DailyWorkLog_date_idx" ON "DailyWorkLog"("date");

-- CreateIndex
CREATE INDEX "SalaryPeriod_businessId_idx" ON "SalaryPeriod"("businessId");

-- CreateIndex
CREATE INDEX "SalaryPeriod_operatorId_idx" ON "SalaryPeriod"("operatorId");

-- CreateIndex
CREATE INDEX "OperatorTransaction_businessId_idx" ON "OperatorTransaction"("businessId");

-- CreateIndex
CREATE INDEX "OperatorTransaction_operatorId_idx" ON "OperatorTransaction"("operatorId");

-- CreateIndex
CREATE INDEX "OperatorTransaction_salaryPeriodId_idx" ON "OperatorTransaction"("salaryPeriodId");

-- CreateIndex
CREATE INDEX "ServiceItem_businessId_idx" ON "ServiceItem"("businessId");

-- CreateIndex
CREATE INDEX "ServiceRecord_businessId_idx" ON "ServiceRecord"("businessId");

-- CreateIndex
CREATE INDEX "ServiceRecord_excavatorId_idx" ON "ServiceRecord"("excavatorId");

-- CreateIndex
CREATE INDEX "ServiceRecordItem_serviceRecordId_idx" ON "ServiceRecordItem"("serviceRecordId");

-- CreateIndex
CREATE INDEX "ServiceRecordItem_serviceItemId_idx" ON "ServiceRecordItem"("serviceItemId");

-- CreateIndex
CREATE INDEX "ExcavatorExpense_businessId_idx" ON "ExcavatorExpense"("businessId");

-- CreateIndex
CREATE INDEX "ExcavatorExpense_excavatorId_idx" ON "ExcavatorExpense"("excavatorId");

-- CreateIndex
CREATE UNIQUE INDEX "BillNumberSequence_businessId_type_key" ON "BillNumberSequence"("businessId", "type");

-- CreateIndex
CREATE INDEX "Bill_businessId_idx" ON "Bill"("businessId");

-- CreateIndex
CREATE INDEX "Bill_customerId_idx" ON "Bill"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_businessId_billNumber_key" ON "Bill"("businessId", "billNumber");

-- CreateIndex
CREATE INDEX "BillItem_billId_idx" ON "BillItem"("billId");

-- CreateIndex
CREATE INDEX "BillItem_excavatorId_idx" ON "BillItem"("excavatorId");

-- CreateIndex
CREATE INDEX "BillItem_workSessionId_idx" ON "BillItem"("workSessionId");

-- CreateIndex
CREATE INDEX "Payment_businessId_idx" ON "Payment"("businessId");

-- CreateIndex
CREATE INDEX "Payment_billId_idx" ON "Payment"("billId");
