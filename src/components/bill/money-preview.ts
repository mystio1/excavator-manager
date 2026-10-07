/**
 * Display-only money math for the bill forms and the printed preview.
 *
 * The SERVER is the source of truth (exact Decimal arithmetic, ROUND_HALF_UP to
 * 2 dp — src/lib/money.ts, which pulls in the Prisma runtime and so cannot be
 * imported by UI code). This is a dependency-free mirror that works in integer
 * paise, so what the form previews is what the server stores: a float product
 * like 1.005 × 100 can land a hair under the half-way point and round the wrong
 * way, integers cannot. tests/unit/money.test.ts checks it against money.ts.
 */

/** Rupees (or hours) → integer hundredths, rounding half away from zero on the
 * number's shortest decimal representation (so 1.005 → 101, like Decimal). */
export function toPaise(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = Number(`${Math.abs(value)}e2`);
  const abs = Math.round(Number.isFinite(scaled) ? scaled : Math.abs(value) * 100);
  return value < 0 ? -abs : abs;
}

export const fromPaise = (paise: number): number => paise / 100;

/** Integer division rounded half away from zero. */
function divRound(numerator: number, denominator: number): number {
  const abs = Math.floor((Math.abs(numerator) + denominator / 2) / denominator);
  return numerator < 0 ? -abs : abs;
}

/** hours × rate as integer paise (a bill-line amount). */
export function lineAmountPaise(hours: number, rate: number): number {
  // hundredths × hundredths = ten-thousandths; ÷ 100 → hundredths (paise).
  return divRound(toPaise(hours) * toPaise(rate), 100);
}

/** GST on a taxable amount, both in paise; `percent` is e.g. 18. */
export function gstTaxPaise(taxablePaise: number, percent: number): number {
  return divRound(taxablePaise * toPaise(percent), 10_000);
}

/** hours × rate in rupees, rounded to paise. */
export const lineAmountRupees = (hours: number, rate: number): number => fromPaise(lineAmountPaise(hours, rate));
