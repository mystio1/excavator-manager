import { describe, expect, it } from "vitest";
import { dieselEntryAverage } from "@/lib/services/siteAnalysis";

/**
 * The owner's spec: each Site Analysis entry shows its OWN consumption rate,
 * computed from that entry alone plus the immediately previous closing balance.
 *   available = (previous closing ?? 0) + litres filled
 *   consumed  = available - this entry's closing
 *   average   = consumed / this entry's running hours
 */
describe("per-entry diesel average", () => {
  it("first entry has no previous balance: (200 - 70) / 10 = 13 L/hr", () => {
    expect(dieselEntryAverage({ hours: 10, filled: 200, closing: 70, prevClosing: null })).toEqual({
      average: 13,
      consumed: 130,
      flagged: false,
    });
  });

  it("second entry carries the 70 L over: (70 + 200 - 140) / 10 = 13 L/hr", () => {
    expect(dieselEntryAverage({ hours: 10, filled: 200, closing: 140, prevClosing: 70 })).toEqual({
      average: 13,
      consumed: 130,
      flagged: false,
    });
  });

  it("third entry stands alone: (140 + 200 - 160) / 10 = 18 L/hr, not an average of 13/13/18", () => {
    const third = dieselEntryAverage({ hours: 10, filled: 200, closing: 160, prevClosing: 140 });
    expect(third.average).toBe(18);
    expect(third.consumed).toBe(180);
    // the running mean of the three days would be 14.67 — that must not appear
    expect(third.average).not.toBeCloseTo((13 + 13 + 18) / 3, 1);
  });

  it("zero running hours does not divide by zero", () => {
    expect(dieselEntryAverage({ hours: 0, filled: 200, closing: 70, prevClosing: null })).toEqual({
      average: null,
      consumed: 130,
      flagged: false,
    });
  });

  it("closing higher than what was available is flagged, not shown as an average", () => {
    expect(dieselEntryAverage({ hours: 10, filled: 100, closing: 400, prevClosing: 70 })).toEqual({
      average: null,
      consumed: -230,
      flagged: true,
    });
  });

  it("no closing balance means no average", () => {
    expect(dieselEntryAverage({ hours: 10, filled: 200, closing: null, prevClosing: 70 }).average).toBeNull();
  });

  it("no fill and no previous balance means no average", () => {
    expect(dieselEntryAverage({ hours: 10, filled: 0, closing: 50, prevClosing: null }).average).toBeNull();
  });

  it("burning down the tank without refuelling still counts: (140 + 0 - 40) / 10 = 10 L/hr", () => {
    expect(dieselEntryAverage({ hours: 10, filled: 0, closing: 40, prevClosing: 140 }).average).toBe(10);
  });
});
