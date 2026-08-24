/*
  Warnings:

  - Added the required column `letterhead` to the `Bill` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "letterhead" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bill_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bill_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Bill_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Bill" ("billDate", "billNumber", "billType", "businessId", "cgst", "createdAt", "customerId", "discount", "extraCharges", "fuelCharges", "gstPercentage", "id", "igst", "notes", "paidAmount", "sgst", "status", "subtotal", "totalAmount", "transportCharges", "updatedAt") SELECT "billDate", "billNumber", "billType", "businessId", "cgst", "createdAt", "customerId", "discount", "extraCharges", "fuelCharges", "gstPercentage", "id", "igst", "notes", "paidAmount", "sgst", "status", "subtotal", "totalAmount", "transportCharges", "updatedAt" FROM "Bill";
DROP TABLE "Bill";
ALTER TABLE "new_Bill" RENAME TO "Bill";
CREATE INDEX "Bill_businessId_idx" ON "Bill"("businessId");
CREATE INDEX "Bill_customerId_idx" ON "Bill"("customerId");
CREATE UNIQUE INDEX "Bill_businessId_billNumber_key" ON "Bill"("businessId", "billNumber");
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
    "billAccentColor" TEXT NOT NULL DEFAULT '#0e2347',
    "billTemplateId" TEXT NOT NULL DEFAULT 'professional',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Business" ("address", "createdAt", "defaultServiceIntervalHrs", "gstNumber", "id", "name", "ownerName", "phone", "updatedAt") SELECT "address", "createdAt", "defaultServiceIntervalHrs", "gstNumber", "id", "name", "ownerName", "phone", "updatedAt" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BankAccount_businessId_idx" ON "BankAccount"("businessId");
