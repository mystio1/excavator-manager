import { Prisma } from "@/generated/prisma/client";

/**
 * Exact money arithmetic.
 *
 * Every money amount and billed quantity is stored as Postgres NUMERIC and
 * handled in code as a Prisma.Decimal (decimal.js) — never as a JS float.
 * Rounding is always ROUND_HALF_UP to 2 decimal places, applied explicitly at
 * each step a printed/stored amount is produced, so the same inputs always give
 * the same totals.
 *
 * Hours/meter readings are measurements, not money; they stay `number` (Float
 * columns) and are converted with dec(Number(x.toFixed(2))) when they enter a
 * money calculation.
 */

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;
export type MoneyInput = number | string | Prisma.Decimal | null | undefined;

export const ZERO = new Decimal(0);

/** Coerces a number / numeric string / Decimal to a Decimal (null → 0).
 * Numbers go through their shortest decimal string, so 0.1 is exactly 0.1. */
export function dec(value: MoneyInput): Decimal {
  if (value === null || value === undefined) return ZERO;
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new RangeError("Money value must be a finite number");
  }
  return new Decimal(value);
}

export function round2(value: MoneyInput): Decimal {
  return dec(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sum(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), ZERO);
}

/** qty × rate, rounded to 2 dp (a bill-line amount). */
export function lineAmount(quantity: MoneyInput, rate: MoneyInput): Decimal {
  return round2(dec(quantity).times(dec(rate)));
}

export function toNumber(value: MoneyInput): number {
  return dec(value).toNumber();
}

/** Plain-decimal string with exactly 2 dp, e.g. "1234.50" (for audit
 * snapshots and anywhere a float would lose the guarantee). */
export function toFixed2(value: MoneyInput): string {
  return round2(value).toFixed(2);
}

/** GST split used on every bill: tax = round2(taxable × rate / 100);
 * CGST = round2(tax / 2); SGST = tax − CGST (so CGST + SGST === tax exactly,
 * even when tax has an odd number of paise). */
export function gstSplit(taxable: MoneyInput, ratePercent: MoneyInput) {
  const rate = dec(ratePercent);
  if (rate.lte(0)) return { tax: ZERO, cgst: null, sgst: null } as const;
  const tax = round2(dec(taxable).times(rate).div(100));
  const cgst = round2(tax.div(2));
  return { tax, cgst, sgst: tax.minus(cgst) } as const;
}

export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export function paymentStatus(paid: MoneyInput, total: MoneyInput): PaymentStatus {
  const p = dec(paid);
  if (p.lte(0)) return "UNPAID";
  return p.gte(dec(total)) ? "PAID" : "PARTIAL";
}

// JSON responses carry money as plain numbers (2 dp, well within the safe
// integer range of a double: NUMERIC(14,2) tops out at 12 integer digits), so
// existing clients keep working. Server-side arithmetic stays exact.
(Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function (this: Decimal) {
  return this.toNumber();
};
