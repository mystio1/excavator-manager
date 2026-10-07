import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/utils/currency";
import { amountInWords } from "@/lib/utils/numberToWords";

describe("formatCurrency", () => {
  it("prints whole rupees without decimals and keeps paise when present", () => {
    expect(formatCurrency(7790)).toBe("₹7,790");
    expect(formatCurrency(7789.63)).toBe("₹7,789.63");
    expect(formatCurrency(0.4)).toBe("₹0.40");
    expect(formatCurrency(1234567.5)).toBe("₹12,34,567.50");
  });
  it("lets a printed GST invoice foot", () => {
    // line 6601.38 + CGST 594.13 + SGST 594.12 = 7789.63 — every figure shown exactly
    const parts = [6601.38, 594.13, 594.12].map(formatCurrency);
    expect(parts).toEqual(["₹6,601.38", "₹594.13", "₹594.12"]);
    expect(formatCurrency(6601.38 + 594.13 + 594.12)).toBe("₹7,789.63");
  });
});

describe("amountInWords", () => {
  it("speaks rupees only for whole amounts", () => {
    expect(amountInWords(7790)).toBe("Seven Thousand Seven Hundred Ninety Rupees Only");
    expect(amountInWords(0)).toBe("Zero Rupees Only");
  });
  it("speaks paise instead of rounding them away", () => {
    expect(amountInWords(7789.63)).toBe("Seven Thousand Seven Hundred Eighty Nine Rupees and Sixty Three Paise Only");
    expect(amountInWords(100.05)).toBe("One Hundred Rupees and Five Paise Only");
    expect(amountInWords(0.4)).toBe("Zero Rupees and Forty Paise Only");
  });
  it("carries correctly at the rupee boundary", () => {
    expect(amountInWords(99.999)).toBe("One Hundred Rupees Only");
  });
});
