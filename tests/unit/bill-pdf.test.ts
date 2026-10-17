import { describe, expect, it } from "vitest";
import { billPdfFilename, waNumber } from "@/lib/bill-pdf";

/** The pure parts of the WhatsApp share: the filename Android sanitises and
 * the number wa.me will accept. Rendering itself needs a real DOM + canvas. */

describe("billPdfFilename", () => {
  it("keeps an ordinary bill number", () => {
    expect(billPdfFilename("NG-0059")).toBe("Bill-NG-0059.pdf");
  });

  it("replaces path separators and spaces a filesystem would choke on", () => {
    expect(billPdfFilename("GST/2026 01")).toBe("Bill-GST-2026-01.pdf");
    expect(billPdfFilename("../../etc/passwd")).toBe("Bill-etc-passwd.pdf");
  });

  it("falls back when the number is nothing but punctuation", () => {
    expect(billPdfFilename("///")).toBe("Bill-bill.pdf");
  });
});

describe("waNumber", () => {
  it("adds India's country code to a bare 10-digit mobile", () => {
    expect(waNumber("9876543210")).toBe("919876543210");
  });

  it("strips spaces, dashes and a leading +", () => {
    expect(waNumber("+91 98765-43210")).toBe("919876543210");
  });

  it("is empty when there is no usable number, so wa.me just opens a chat picker", () => {
    expect(waNumber(null)).toBe("");
    expect(waNumber("")).toBe("");
    expect(waNumber("12345")).toBe("");
  });
});
