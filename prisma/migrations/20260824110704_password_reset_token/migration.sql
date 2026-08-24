-- AlterTable
ALTER TABLE "User" ADD COLUMN "resetTokenExpiry" DATETIME;
ALTER TABLE "User" ADD COLUMN "resetTokenHash" TEXT;
