-- What the business pays for a litre of diesel. Used to cost the litres recorded on work when no
-- actual diesel purchase is recorded for a machine (Business Profit Overview). Nullable: unset
-- means diesel litres are not costed. IF NOT EXISTS so a re-run against a database that already
-- has it (e.g. a shared dev database) is harmless.
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "dieselPricePerLitre" DECIMAL(10,2);
