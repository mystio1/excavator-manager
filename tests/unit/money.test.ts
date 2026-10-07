import { describe, expect, it } from "vitest";
import { Decimal, ZERO, dec, gstSplit, lineAmount, paymentStatus, round2, sum, toFixed2, toNumber } from "@/lib/money";
import { fromPaise, gstTaxPaise, lineAmountPaise, lineAmountRupees, toPaise } from "@/components/bill/money-preview";

/**
 * Pure tests (no database) for the exact-money helpers every bill, payment and
 * report is built on, plus the dependency-free paise mirror the bill forms use
 * to PREVIEW what the server will store.
 */

describe("dec / round2", () => {
  it("builds exact decimals from numbers via their shortest representation", () => {
    expect(dec(0.1).plus(dec(0.2)).toString()).toBe("0.3");
    expect(dec(1.1).times(3).toString()).toBe("3.3");
    expect(dec("12.30").toString()).toBe("12.3");
  });

  it("treats null/undefined as zero and refuses non-finite numbers", () => {
    expect(dec(null).isZero()).toBe(true);
    expect(dec(undefined).isZero()).toBe(true);
    expect(() => dec(Number.NaN)).toThrow(RangeError);
    expect(() => dec(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("rounds HALF_UP to 2 dp where binary floats get it wrong", () => {
    expect(round2(1.005).toFixed(2)).toBe("1.01"); // Math.round(1.005 * 100) / 100 === 1
    expect(round2(2.675).toFixed(2)).toBe("2.68"); // (2.675).toFixed(2) === "2.67"
    expect(round2(1.115).toFixed(2)).toBe("1.12");
    expect(round2("0.004").toFixed(2)).toBe("0.00");
    expect(round2("0.005").toFixed(2)).toBe("0.01");
  });

  it("rounds ties away from zero for negative values (ROUND_HALF_UP)", () => {
    expect(round2(-1.005).toFixed(2)).toBe("-1.01");
    expect(round2(-0.004).toFixed(2)).toBe("0.00");
  });

  it("is deterministic and idempotent", () => {
    const once = round2("33849.395");
    expect(once.toFixed(2)).toBe("33849.40");
    expect(round2(once).equals(once)).toBe(true);
  });
});

describe("sum", () => {
  it("adds without float drift", () => {
    expect(sum([0.1, 0.2, 0.3]).toString()).toBe("0.6");
    expect(sum(Array.from({ length: 10 }, () => 0.1)).toString()).toBe("1");
    expect(sum([]).isZero()).toBe(true);
  });

  it("accepts mixed number / string / Decimal / null input", () => {
    expect(sum([1.5, "2.25", new Decimal("0.25"), null, undefined]).toString()).toBe("4");
  });
});

describe("lineAmount", () => {
  it("is hours x rate rounded to paise", () => {
    expect(lineAmount(8, 1800.5).toFixed(2)).toBe("14404.00");
    expect(lineAmount(18.8, 1800.5).toFixed(2)).toBe("33849.40");
    expect(lineAmount(5.5, 1200.25).toFixed(2)).toBe("6601.38"); // 6601.375 -> half up
    expect(lineAmount(1, 1.005).toFixed(2)).toBe("1.01");
  });

  it("does not accumulate error across many lines", () => {
    // 0.1 h x 3 per line, 1000 lines: exactly 300.00 (floats give 300.00000000000006 or so)
    const lines = Array.from({ length: 1000 }, () => lineAmount(0.1, 3));
    expect(sum(lines).toFixed(2)).toBe("300.00");
  });
});

describe("gstSplit", () => {
  it("splits an even tax into two equal halves", () => {
    const g = gstSplit("1000.00", 18);
    expect(g.tax.toFixed(2)).toBe("180.00");
    expect(g.cgst?.toFixed(2)).toBe("90.00");
    expect(g.sgst?.toFixed(2)).toBe("90.00");
  });

  it("keeps cgst + sgst === tax exactly when the tax has an odd number of paise", () => {
    // 100.50 x 5% = 5.025 -> 5.03 ; half = 2.515 -> cgst 2.52, sgst 2.51
    const g = gstSplit("100.50", 5);
    expect(g.tax.toFixed(2)).toBe("5.03");
    expect(g.cgst?.toFixed(2)).toBe("2.52");
    expect(g.sgst?.toFixed(2)).toBe("2.51");
    expect(g.cgst!.plus(g.sgst!).equals(g.tax)).toBe(true);
  });

  it("holds the cgst + sgst === tax invariant over a wide sweep", () => {
    for (const rate of [5, 12, 18, 28, 2.5, 0.25]) {
      for (let paise = 1; paise <= 500; paise += 7) {
        const g = gstSplit(dec(paise).div(100), rate);
        expect(g.cgst!.plus(g.sgst!).equals(g.tax)).toBe(true);
        expect(g.tax.decimalPlaces()).toBeLessThanOrEqual(2);
      }
    }
  });

  it("gives no tax split for a zero (or negative) rate", () => {
    const g = gstSplit("500", 0);
    expect(g.tax.isZero()).toBe(true);
    expect(g.cgst).toBeNull();
    expect(g.sgst).toBeNull();
  });

  it("matches the worked example 18.8 h x 1800.50 at 18%", () => {
    const taxable = lineAmount(18.8, 1800.5);
    const g = gstSplit(taxable, 18);
    expect(g.tax.toFixed(2)).toBe("6092.89"); // 6092.892
    expect(g.cgst?.toFixed(2)).toBe("3046.45"); // 3046.445 -> half up
    expect(g.sgst?.toFixed(2)).toBe("3046.44");
    expect(taxable.plus(g.tax).toFixed(2)).toBe("39942.29");
  });
});

describe("paymentStatus", () => {
  it("derives UNPAID / PARTIAL / PAID", () => {
    expect(paymentStatus(0, 1000)).toBe("UNPAID");
    expect(paymentStatus("0.00", "1000.00")).toBe("UNPAID");
    expect(paymentStatus(0.01, 1000)).toBe("PARTIAL");
    expect(paymentStatus("999.99", "1000.00")).toBe("PARTIAL");
    expect(paymentStatus("1000.00", "1000.00")).toBe("PAID");
    expect(paymentStatus(1000.01, 1000)).toBe("PAID");
  });

  it("is not fooled by float sums (0.1 + 0.2 paid of 0.3)", () => {
    expect(paymentStatus(sum([0.1, 0.2]), "0.30")).toBe("PAID");
  });

  it("treats a zero-total bill with nothing paid as UNPAID", () => {
    expect(paymentStatus(0, 0)).toBe("UNPAID");
  });
});

describe("serialization helpers", () => {
  it("JSON-serializes a Decimal as a plain number", () => {
    expect(JSON.stringify({ amount: dec("12.30"), nested: [dec("0.1")] })).toBe('{"amount":12.3,"nested":[0.1]}');
  });

  it("toFixed2 / toNumber", () => {
    expect(toFixed2("1234.5")).toBe("1234.50");
    expect(toFixed2(0.005)).toBe("0.01");
    expect(toNumber("12.34")).toBe(12.34);
    expect(ZERO.toString()).toBe("0");
  });
});

/** The bill forms preview totals with integer paise (no Prisma runtime in UI
 * code). The preview must agree with the server's Decimal math exactly. */
describe("money-preview (client paise mirror) agrees with money.ts", () => {
  it("converts to paise on the shortest decimal representation", () => {
    expect(toPaise(1.005)).toBe(101);
    expect(toPaise(2.675)).toBe(268);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(-1.005)).toBe(-101);
    expect(toPaise(Number.NaN)).toBe(0);
    expect(fromPaise(3384940)).toBe(33849.4);
  });

  it("line amounts match the service: hours and rate are rounded to paise first, then lineAmount()", () => {
    const hoursList = [0, 0.25, 1, 4.5, 7.75, 8, 8.1, 8.2, 12.34, 18.8, 99.99];
    const rates = [0, 1, 1.005, 99.5, 1200.25, 1800.5, 2500.75, 3333.33];
    for (const h of hoursList) {
      for (const r of rates) {
        const server = lineAmount(round2(h), round2(r));
        expect(lineAmountRupees(h, r)).toBe(server.toNumber());
        expect(lineAmountPaise(h, r)).toBe(server.times(100).toNumber());
      }
    }
  });

  it("GST tax matches gstSplit().tax for typical taxable amounts and rates", () => {
    const taxables = ["0.01", "1.00", "100.50", "999.99", "8651.38", "33849.40", "56495.65", "123456.78"];
    for (const taxable of taxables) {
      for (const rate of [5, 12, 18, 28]) {
        const expected = gstSplit(taxable, rate).tax.times(100).toNumber();
        expect(gstTaxPaise(toPaise(Number(taxable)), rate)).toBe(expected);
      }
    }
  });
});
