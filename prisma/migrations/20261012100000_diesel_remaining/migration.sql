-- Diesel remaining-in-tank tracking for accurate consumption rate calculation.
-- When an operator or admin records a new diesel fill they can also enter how
-- much was left in the tank from the previous fill; the difference gives the
-- actual litres consumed and (together with hours worked) the L/hr rate.

ALTER TABLE "DailyWorkLog"  ADD COLUMN "remainingDieselLiters" DOUBLE PRECISION;
ALTER TABLE "WorkSession"   ADD COLUMN "remainingDieselLiters" DOUBLE PRECISION;
