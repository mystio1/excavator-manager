-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "gstNumber" TEXT,
    "code" TEXT NOT NULL,
    "defaultServiceIntervalHrs" DOUBLE PRECISION NOT NULL DEFAULT 350,
    "maintenanceAlertThresholdHrs" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "operatorLanguage" TEXT NOT NULL DEFAULT 'en',
    "logoLeftUrl" TEXT,
    "logoRightUrl" TEXT,
    "signatureUrl" TEXT,
    "billTagline" TEXT,
    "billAccentColor" TEXT NOT NULL DEFAULT '#0B2B5E',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branch" TEXT,
    "isDefaultForGst" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultForNonGst" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "resetTokenHash" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Excavator" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machineNumber" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "startingHourMeter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentHourMeter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "serviceIntervalHrs" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "currentOperatorId" TEXT,
    "currentSiteId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Excavator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorAssignment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "companyName" TEXT,
    "address" TEXT,
    "gstNumber" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "address" TEXT,
    "joiningDate" TIMESTAMP(3),
    "defaultMonthlySalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "pinHash" TEXT,
    "canLogin" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "startHourMeter" DOUBLE PRECISION NOT NULL,
    "endHourMeter" DOUBLE PRECISION,
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attachment" TEXT,
    "dieselLiters" DOUBLE PRECISION,
    "dieselDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorWorkRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "startHourMeter" DOUBLE PRECISION NOT NULL,
    "endDate" TIMESTAMP(3),
    "endHourMeter" DOUBLE PRECISION,
    "attachment" TEXT,
    "siteName" TEXT,
    "dieselLiters" DOUBLE PRECISION,
    "dieselDate" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "rejectionNote" TEXT,
    "workSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "OperatorWorkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWorkLog" (
    "id" TEXT NOT NULL,
    "workSessionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "stopTime" TEXT,
    "breakMinutes" INTEGER,
    "startHourMeter" DOUBLE PRECISION,
    "endHourMeter" DOUBLE PRECISION,
    "hoursWorked" DOUBLE PRECISION NOT NULL,
    "operatorName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ADMIN',
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyWorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionCategory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TransactionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorTransaction" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "deductFromSalary" BOOLEAN NOT NULL DEFAULT true,
    "businessEffect" TEXT NOT NULL DEFAULT 'ADVANCE_RECOVERABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceItem" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "defaultIntervalHours" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRecord" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "hourMeterAtService" DOUBLE PRECISION NOT NULL,
    "serviceType" TEXT,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "nextServiceDueHour" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRecordItem" (
    "id" TEXT NOT NULL,
    "serviceRecordId" TEXT NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'Serviced',
    "done" BOOLEAN NOT NULL DEFAULT true,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "brand" TEXT,
    "notes" TEXT,

    CONSTRAINT "ServiceRecordItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExcavatorExpense" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExcavatorExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillNumberSequence" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BillNumberSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "billType" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "billDate" TIMESTAMP(3) NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "transportCharges" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fuelCharges" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extraCharges" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bucketCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "breakerCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstPercentage" DOUBLE PRECISION,
    "cgst" DOUBLE PRECISION,
    "sgst" DOUBLE PRECISION,
    "igst" DOUBLE PRECISION,
    "buyerGstin" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,
    "showCustomerPhone" BOOLEAN NOT NULL DEFAULT true,
    "isDirect" BOOLEAN NOT NULL DEFAULT false,
    "excavatorId" TEXT,
    "fromDate" TIMESTAMP(3),
    "toDate" TIMESTAMP(3),
    "bucketHours" DOUBLE PRECISION,
    "bucketRate" DOUBLE PRECISION,
    "breakerHours" DOUBLE PRECISION,
    "breakerRate" DOUBLE PRECISION,
    "dieselLiters" DOUBLE PRECISION,
    "dieselPricePerLiter" DOUBLE PRECISION,
    "dieselAdvance" DOUBLE PRECISION,
    "letterhead" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillItem" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "workSessionId" TEXT,
    "siteName" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "ratePerHour" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BillItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_code_key" ON "Business"("code");

-- CreateIndex
CREATE INDEX "BankAccount_businessId_idx" ON "BankAccount"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_businessId_idx" ON "User"("businessId");

-- CreateIndex
CREATE INDEX "Excavator_businessId_idx" ON "Excavator"("businessId");

-- CreateIndex
CREATE INDEX "Excavator_businessId_status_idx" ON "Excavator"("businessId", "status");

-- CreateIndex
CREATE INDEX "Excavator_currentOperatorId_idx" ON "Excavator"("currentOperatorId");

-- CreateIndex
CREATE INDEX "OperatorAssignment_businessId_idx" ON "OperatorAssignment"("businessId");

-- CreateIndex
CREATE INDEX "OperatorAssignment_excavatorId_idx" ON "OperatorAssignment"("excavatorId");

-- CreateIndex
CREATE INDEX "OperatorAssignment_operatorId_idx" ON "OperatorAssignment"("operatorId");

-- CreateIndex
CREATE INDEX "Site_businessId_idx" ON "Site"("businessId");

-- CreateIndex
CREATE INDEX "Customer_businessId_idx" ON "Customer"("businessId");

-- CreateIndex
CREATE INDEX "Operator_businessId_idx" ON "Operator"("businessId");

-- CreateIndex
CREATE INDEX "Operator_mobile_idx" ON "Operator"("mobile");

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
CREATE UNIQUE INDEX "OperatorWorkRequest_workSessionId_key" ON "OperatorWorkRequest"("workSessionId");

-- CreateIndex
CREATE INDEX "OperatorWorkRequest_businessId_idx" ON "OperatorWorkRequest"("businessId");

-- CreateIndex
CREATE INDEX "OperatorWorkRequest_excavatorId_idx" ON "OperatorWorkRequest"("excavatorId");

-- CreateIndex
CREATE INDEX "OperatorWorkRequest_operatorId_idx" ON "OperatorWorkRequest"("operatorId");

-- CreateIndex
CREATE INDEX "DailyWorkLog_workSessionId_idx" ON "DailyWorkLog"("workSessionId");

-- CreateIndex
CREATE INDEX "DailyWorkLog_date_idx" ON "DailyWorkLog"("date");

-- CreateIndex
CREATE INDEX "DailyWorkLog_status_idx" ON "DailyWorkLog"("status");

-- CreateIndex
CREATE INDEX "TransactionCategory_businessId_idx" ON "TransactionCategory"("businessId");

-- CreateIndex
CREATE INDEX "OperatorTransaction_businessId_idx" ON "OperatorTransaction"("businessId");

-- CreateIndex
CREATE INDEX "OperatorTransaction_operatorId_idx" ON "OperatorTransaction"("operatorId");

-- CreateIndex
CREATE INDEX "OperatorTransaction_categoryId_idx" ON "OperatorTransaction"("categoryId");

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

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Excavator" ADD CONSTRAINT "Excavator_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Excavator" ADD CONSTRAINT "Excavator_currentOperatorId_fkey" FOREIGN KEY ("currentOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Excavator" ADD CONSTRAINT "Excavator_currentSiteId_fkey" FOREIGN KEY ("currentSiteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorAssignment" ADD CONSTRAINT "OperatorAssignment_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorAssignment" ADD CONSTRAINT "OperatorAssignment_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operator" ADD CONSTRAINT "Operator_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorWorkRequest" ADD CONSTRAINT "OperatorWorkRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorWorkRequest" ADD CONSTRAINT "OperatorWorkRequest_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorWorkRequest" ADD CONSTRAINT "OperatorWorkRequest_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorWorkRequest" ADD CONSTRAINT "OperatorWorkRequest_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkLog" ADD CONSTRAINT "DailyWorkLog_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCategory" ADD CONSTRAINT "TransactionCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorTransaction" ADD CONSTRAINT "OperatorTransaction_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorTransaction" ADD CONSTRAINT "OperatorTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecordItem" ADD CONSTRAINT "ServiceRecordItem_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "ServiceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecordItem" ADD CONSTRAINT "ServiceRecordItem_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcavatorExpense" ADD CONSTRAINT "ExcavatorExpense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcavatorExpense" ADD CONSTRAINT "ExcavatorExpense_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillNumberSequence" ADD CONSTRAINT "BillNumberSequence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

