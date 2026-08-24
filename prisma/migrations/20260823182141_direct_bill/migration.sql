-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "billType" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "billDate" DATETIME NOT NULL,
    "subtotal" REAL NOT NULL,
    "transportCharges" REAL NOT NULL DEFAULT 0,
    "fuelCharges" REAL NOT NULL DEFAULT 0,
    "extraCharges" REAL NOT NULL DEFAULT 0,
    "bucketCharge" REAL NOT NULL DEFAULT 0,
    "breakerCharge" REAL NOT NULL DEFAULT 0,
    "discount" REAL NOT NULL DEFAULT 0,
    "gstPercentage" REAL,
    "cgst" REAL,
    "sgst" REAL,
    "igst" REAL,
    "buyerGstin" TEXT,
    "totalAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,
    "showCustomerPhone" BOOLEAN NOT NULL DEFAULT true,
    "isDirect" BOOLEAN NOT NULL DEFAULT false,
    "excavatorId" TEXT,
    "fromDate" DATETIME,
    "toDate" DATETIME,
    "bucketHours" REAL,
    "bucketRate" REAL,
    "breakerHours" REAL,
    "breakerRate" REAL,
    "dieselLiters" REAL,
    "dieselPricePerLiter" REAL,
    "dieselAdvance" REAL,
    "letterhead" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bill_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bill_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Bill_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Bill_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Bill" ("bankAccountId", "billDate", "billNumber", "billType", "breakerCharge", "bucketCharge", "businessId", "buyerGstin", "cgst", "createdAt", "customerId", "discount", "extraCharges", "fuelCharges", "gstPercentage", "id", "igst", "letterhead", "notes", "paidAmount", "sgst", "showCustomerPhone", "status", "subtotal", "totalAmount", "transportCharges", "updatedAt") SELECT "bankAccountId", "billDate", "billNumber", "billType", "breakerCharge", "bucketCharge", "businessId", "buyerGstin", "cgst", "createdAt", "customerId", "discount", "extraCharges", "fuelCharges", "gstPercentage", "id", "igst", "letterhead", "notes", "paidAmount", "sgst", "showCustomerPhone", "status", "subtotal", "totalAmount", "transportCharges", "updatedAt" FROM "Bill";
DROP TABLE "Bill";
ALTER TABLE "new_Bill" RENAME TO "Bill";
CREATE INDEX "Bill_businessId_idx" ON "Bill"("businessId");
CREATE INDEX "Bill_customerId_idx" ON "Bill"("customerId");
CREATE UNIQUE INDEX "Bill_businessId_billNumber_key" ON "Bill"("businessId", "billNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
