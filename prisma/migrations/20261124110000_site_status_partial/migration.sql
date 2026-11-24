-- Sites can now be "Partially Completed" (PARTIAL): asked when a machine leaves a site, and
-- settable in Site Analysis. Widen the status check to allow it (ON_HOLD is shown as "Deactive").
ALTER TABLE "Site" DROP CONSTRAINT IF EXISTS "Site_status_check";
ALTER TABLE "Site" ADD CONSTRAINT "Site_status_check" CHECK ("status" IN ('ACTIVE','PARTIAL','COMPLETED','ON_HOLD')) NOT VALID;
