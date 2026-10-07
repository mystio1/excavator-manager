-- Security & integrity infrastructure:
--   * optimistic-concurrency `version` columns
--   * session-revocation `tokenVersion` columns
--   * richer, append-only AuditLog
--   * IdempotencyKey, RateLimitBucket, SupportSession, OperatorJoinRequest
--   * BillItem.workSessionId UNIQUE (a work session can be billed at most once)
--   * defense-in-depth CHECK constraints on payments
-- Additive only: nothing here deletes or rewrites existing business data.

-- ---------------------------------------------------------------------------
-- Guard: refuse to add the unique index if existing data already violates it.
-- Duplicate billing of a work session is a financial discrepancy that needs a
-- human decision, not an automatic fix. Abort with the offending ids instead.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dup_count bigint;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT "workSessionId" FROM "BillItem"
    WHERE "workSessionId" IS NOT NULL
    GROUP BY "workSessionId" HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'security_and_integrity migration aborted: % work session(s) are billed more than once. Find them with: SELECT "workSessionId", array_agg("billId") FROM "BillItem" WHERE "workSessionId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1; then resolve (edit/delete the duplicate bill lines) and re-run.', dup_count;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "actorType" TEXT NOT NULL DEFAULT 'OWNER',
ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB,
ADD COLUMN     "entityType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "requestId" TEXT;

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DailyWorkLog" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Excavator" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OperatorTransaction" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "actorId" TEXT,
    "requestHash" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "SupportSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SupportSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorJoinRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "verificationHash" TEXT NOT NULL,
    "verifyAttempts" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "operatorId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_businessId_key_key" ON "IdempotencyKey"("businessId", "key");

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "SupportSession_tokenHash_key" ON "SupportSession"("tokenHash");

-- CreateIndex
CREATE INDEX "SupportSession_expiresAt_idx" ON "SupportSession"("expiresAt");

-- CreateIndex
CREATE INDEX "OperatorJoinRequest_businessId_status_idx" ON "OperatorJoinRequest"("businessId", "status");

-- CreateIndex
CREATE INDEX "OperatorJoinRequest_mobile_idx" ON "OperatorJoinRequest"("mobile");

-- CreateIndex
CREATE INDEX "OperatorJoinRequest_expiresAt_idx" ON "OperatorJoinRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_entityType_entityId_idx" ON "AuditLog"("businessId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "BillItem_workSessionId_key" ON "BillItem"("workSessionId");

-- AddForeignKey
ALTER TABLE "OperatorJoinRequest" ADD CONSTRAINT "OperatorJoinRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Legacy join requests.
-- Before this change a join request was stored directly on the Operator row
-- (pinHash set, canLogin = false). Move each such pending request into the new
-- table, linked to its existing Operator row, and clear the PIN hash from the
-- Operator row so credentials only ever become usable through an explicit
-- admin approval. The PIN hash is preserved on the request, so nothing is lost.
-- Legacy requests have no verification code (verificationHash = '').
-- ---------------------------------------------------------------------------
INSERT INTO "OperatorJoinRequest"
  ("id", "businessId", "name", "mobile", "pinHash", "verificationHash", "status", "operatorId", "expiresAt", "createdAt")
SELECT 'legacy_' || o."id", o."businessId", o."name", o."mobile", o."pinHash", '', 'PENDING', o."id",
       CURRENT_TIMESTAMP + INTERVAL '7 days', o."createdAt"
FROM "Operator" o
WHERE o."pinHash" IS NOT NULL AND o."canLogin" = false AND o."isArchived" = false
  -- idempotent: safe to run again (see docs/runbook-recovery.md, rolling-deploy overlap)
  AND NOT EXISTS (SELECT 1 FROM "OperatorJoinRequest" r WHERE r."id" = 'legacy_' || o."id");

UPDATE "Operator" SET "pinHash" = NULL
WHERE "pinHash" IS NOT NULL AND "canLogin" = false AND "isArchived" = false
  AND EXISTS (SELECT 1 FROM "OperatorJoinRequest" r WHERE r."id" = 'legacy_' || "Operator"."id");

-- ---------------------------------------------------------------------------
-- AuditLog is append-only. Ordinary application code (and any compromised
-- business user session) cannot UPDATE, DELETE or TRUNCATE audit history.
-- A privileged maintenance path (tests, a deliberate tenant purge) can opt in
-- per-transaction with:  SELECT set_config('app.allow_audit_purge', 'on', true);
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.allow_audit_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'AuditLog is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();

-- ---------------------------------------------------------------------------
-- Defense-in-depth for payments (the application enforces these under a row
-- lock; the database refuses to store a violation even if a code path is
-- missed). NOT VALID = applies to every new/updated row but does not
-- retroactively reject legacy rows (which can be reviewed and then VALIDATEd).
-- ---------------------------------------------------------------------------
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0) NOT VALID;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_paid_non_negative" CHECK ("paidAmount" >= 0) NOT VALID;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_paid_within_total" CHECK ("paidAmount" <= "totalAmount") NOT VALID;
