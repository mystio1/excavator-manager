export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
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
