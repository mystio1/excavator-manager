-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BillItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billId" TEXT NOT NULL,
    "excavatorId" TEXT NOT NULL,
    "workSessionId" TEXT,
    "siteName" TEXT NOT NULL,
    "fromDate" DATETIME NOT NULL,
    "toDate" DATETIME NOT NULL,
    "hours" REAL NOT NULL,
    "ratePerHour" REAL NOT NULL,
    "amount" REAL NOT NULL,
    CONSTRAINT "BillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillItem_excavatorId_fkey" FOREIGN KEY ("excavatorId") REFERENCES "Excavator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BillItem_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "WorkSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BillItem" ("id", "billId", "excavatorId", "workSessionId", "siteName", "fromDate", "toDate", "hours", "ratePerHour", "amount")
SELECT bi."id", bi."billId", bi."excavatorId", bi."workSessionId",
       COALESCE((SELECT s."name" FROM "WorkSession" ws JOIN "Site" s ON s."id" = ws."siteId" WHERE ws."id" = bi."workSessionId"), 'Unknown Site'),
       bi."fromDate", bi."toDate", bi."hours", bi."ratePerHour", bi."amount"
FROM "BillItem" bi;
DROP TABLE "BillItem";
ALTER TABLE "new_BillItem" RENAME TO "BillItem";
CREATE INDEX "BillItem_billId_idx" ON "BillItem"("billId");
CREATE INDEX "BillItem_excavatorId_idx" ON "BillItem"("excavatorId");
CREATE INDEX "BillItem_workSessionId_idx" ON "BillItem"("workSessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
