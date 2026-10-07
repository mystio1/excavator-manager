import { describe, expect, it } from "vitest";
import { normalizeValue, showValue, summarizeChanges } from "@/lib/utils/change-summary";

describe("summarizeChanges (the 'are you sure?' list)", () => {
  it("lists only the fields that really changed, in order, with old and new values", () => {
    const changes = summarizeChanges([
      { label: "Site", before: "Kharadi", after: "Kharadi" },
      { label: "Diesel (L)", before: 20, after: "25" },
      { label: "Tool", before: "Bucket", after: "Breaker" },
    ]);
    expect(changes).toEqual([
      { label: "Diesel (L)", from: "20", to: "25" },
      { label: "Tool", from: "Bucket", to: "Breaker" },
    ]);
  });

  it("treats null, undefined, '' and whitespace as the same 'nothing'", () => {
    expect(summarizeChanges([{ label: "Note", before: null, after: "  " }, { label: "Tool", before: undefined, after: "" }])).toEqual([]);
  });

  it("compares numbers by value, so 8 and '8.0' are not a change but 0 and '' are", () => {
    expect(summarizeChanges([{ label: "Hours", before: 8, after: "8.0" }])).toEqual([]);
    expect(summarizeChanges([{ label: "Diesel", before: 0, after: "" }])).toEqual([{ label: "Diesel", from: "0", to: "" }]);
  });

  it("reports clearing a value and adding a value", () => {
    expect(summarizeChanges([{ label: "Note", before: "old", after: "" }, { label: "Tool", before: null, after: "Bucket" }])).toEqual([
      { label: "Note", from: "old", to: "" },
      { label: "Tool", from: "", to: "Bucket" },
    ]);
  });

  it("shows an em dash for empty values and keeps text values as they are", () => {
    expect(showValue("")).toBe("—");
    expect(showValue("Bucket")).toBe("Bucket");
    expect(normalizeValue(12.5)).toBe("12.5");
  });
});
