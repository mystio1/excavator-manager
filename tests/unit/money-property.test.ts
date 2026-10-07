import "../bills/pool";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { computeTotals } from "@/components/bill/editor/bill-math";
import type { BillFields, DirectFields, Row } from "@/components/bill/editor/types";
import { Decimal, dec, gstSplit, lineAmount, paymentStatus, round2, sum } from "@/lib/money";
import { normalBillTotals, readCharges } from "@/lib/services/bills";

/**
 * Property-based checks of the money pipeline. Example tests only cover the
 * numbers somebody thought of; these generate thousands of hours/rates/charges
 * and require that
 *   1. the client preview (integer paise) and the server (exact Decimal)
 *      always agree to the paisa, and
 *   2. the arithmetic identities the integrity checker relies on hold.
 * A failing case is shrunk to the smallest counter-example and printed with its seed.
 */

const RUNS = 1500;

/** Amount with exactly 2 decimals, as the forms produce them. */
const amount = (maxPaise: number) => fc.integer({ min: 0, max: maxPaise }).map((p) => p / 100);
const text = (n: number) => n.toFixed(2);

const hours = amount(9_999_99);
const rate = amount(99_999_99);
const charge = amount(99_999_99);
const gstRate = fc.constantFrom(5, 12, 18, 28);
const billType = fc.constantFrom<"GST" | "NON_GST">("GST", "NON_GST");

const line = fc.record({ hours, rate });
const scenario = fc.record({
  lines: fc.array(line, { minLength: 1, maxLength: 12 }),
  transport: charge,
  fuel: charge,
  extra: charge,
  bucket: charge,
  breaker: charge,
  discount: charge,
  billType,
  gst: gstRate,
});

const emptyDirect: DirectFields = {
  excavatorId: "",
  fromDate: "2026-10-01",
  toDate: "2026-10-02",
  bucketHours: "",
  bucketRate: "",
  breakerHours: "",
  breakerRate: "",
  dieselLiters: "",
  dieselPricePerLiter: "",
};

describe("client preview agrees with the server to the paisa", () => {
  it("normal bills: subtotal, tax and total", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const rows = s.lines.map((l, i) => ({ key: i, excavatorId: "m", siteName: "s", fromDate: "2026-10-01", toDate: "2026-10-01", hours: text(l.hours), rate: text(l.rate) }) as unknown as Row);
        const client = computeTotals({
          isDirect: false,
          rows,
          direct: emptyDirect,
          fields: {
            transport: text(s.transport),
            fuel: text(s.fuel),
            extra: text(s.extra),
            bucket: text(s.bucket),
            breaker: text(s.breaker),
            discount: text(s.discount),
            billType: s.billType,
            gstPercentage: s.gst,
          } as Pick<BillFields, "transport" | "fuel" | "extra" | "bucket" | "breaker" | "discount" | "billType" | "gstPercentage">,
        });

        const subtotal = sum(s.lines.map((l) => lineAmount(l.hours, l.rate)));
        const charges = readCharges({
          transportCharges: s.transport,
          fuelCharges: s.fuel,
          extraCharges: s.extra,
          bucketCharge: s.bucket,
          breakerCharge: s.breaker,
          discount: s.discount,
        });
        const server = normalBillTotals(subtotal, charges, s.billType, s.gst);

        expect(client.subtotal).toBe(subtotal.toNumber());
        expect(client.taxable).toBe(server.taxable.toNumber());
        expect(client.total).toBe(server.total.toNumber());
        // CGST + SGST is the whole tax, and the server's total includes exactly it.
        if (s.billType === "GST") {
          const tax = (server.cgst ?? dec(0)).plus(server.sgst ?? dec(0));
          expect(client.tax).toBe(tax.toNumber());
        } else {
          expect(client.tax).toBe(0);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

describe("money identities", () => {
  it("round2 is idempotent and never moves a value by more than half a paisa", () => {
    fc.assert(
      fc.property(fc.integer({ min: -10_000_000_0000, max: 10_000_000_0000 }), (tenThousandths) => {
        const x = new Decimal(tenThousandths).div(10_000); // up to 4 decimals, either sign
        const r = round2(x);
        expect(round2(r).equals(r)).toBe(true);
        expect(r.minus(x).abs().lte(new Decimal("0.005"))).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("GST split: cgst + sgst always equals the tax, with no paisa lost or invented", () => {
    fc.assert(
      fc.property(amount(99_999_999_99), gstRate, (taxable, rateValue) => {
        const split = gstSplit(taxable, rateValue);
        const tax = round2(dec(taxable).times(rateValue).div(100));
        expect(split.tax.equals(tax)).toBe(true);
        expect((split.cgst ?? dec(0)).plus(split.sgst ?? dec(0)).equals(tax)).toBe(true);
        // The two halves differ by at most one paisa.
        expect((split.cgst ?? dec(0)).minus(split.sgst ?? dec(0)).abs().lte(new Decimal("0.01"))).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("any sequence of payments keeps paid <= total and the status consistent", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5_000_000_00 }), fc.array(fc.integer({ min: 1, max: 1_000_000_00 }), { maxLength: 15 }), (totalPaise, attempts) => {
        const total = dec(totalPaise).div(100);
        let paid = dec(0);
        for (const p of attempts) {
          const pay = dec(p).div(100);
          // The service refuses a payment larger than the remaining balance; model that rule.
          if (paid.plus(pay).lte(total)) paid = paid.plus(pay);
          expect(paid.lte(total)).toBe(true);
          const status = paymentStatus(paid, total);
          expect(status).toBe(paid.isZero() ? "UNPAID" : paid.equals(total) ? "PAID" : "PARTIAL");
        }
      }),
      { numRuns: RUNS },
    );
  });
});
