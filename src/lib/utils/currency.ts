/** Whole rupees print without decimals (₹7,790); an amount that has paise shows
 * both digits (₹7,789.63 / ₹7,789.60). Money is stored exactly (NUMERIC), so what is shown must
 * be what is stored — rounding to whole rupees made printed GST invoices
 * not add up (e.g. ₹6,601 + ₹594 + ₹594 shown against a ₹7,790 total). */
export function formatCurrency(amount: number) {
  const hasPaise = Math.round(Math.abs(amount) * 100) % 100 !== 0;
  const digits = hasPaise ? 2 : 0; // ₹7,790 or ₹7,789.60 — never ₹7,789.6
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

/** Always shows two decimals (₹7,790.00) — for a step-by-step calculation
 * breakdown, where showing 833.33/day and 78,333.33 in total is the point
 * (verifying the math). */
export function formatCurrencyPrecise(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Indian lakh/crore shorthand for dashboard stat tiles — ₹1,52,896 reads as
 * ₹1.5L, a crore-plus figure as ₹1.2Cr. Below ₹1L, same as formatCurrency
 * (there's nothing to abbreviate). Callers should still show the exact
 * value somewhere (e.g. a hover/click tooltip) since this is lossy. */
export function formatCurrencyCompact(amount: number) {
  const abs = Math.abs(amount);
  if (abs >= 1_00_00_000) return `₹${trimDecimal(amount / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `₹${trimDecimal(amount / 1_00_000)}L`;
  return formatCurrency(amount);
}

function trimDecimal(n: number) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
