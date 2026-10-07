import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/** "Today" for a form default must be the user's LOCAL calendar day. Operators in
 * India start work before 05:30 IST, when the UTC date is still the previous day. */
describe("today's date default (IST early morning)", () => {
  beforeAll(() => {
    process.env.TZ = "Asia/Kolkata";
  });
  afterEach(() => vi.useRealTimers());

  const at = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it("documents the bug: the UTC slice is YESTERDAY at 00:30 IST", () => {
    at("2026-10-05T19:00:00Z"); // = 2026-10-06 00:30 IST
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-05"); // what the old code used
  });

  it("todayLocal() returns the local day at 00:30 IST", async () => {
    at("2026-10-05T19:00:00Z");
    const { todayLocal } = await import("@/lib/utils/dates");
    expect(todayLocal()).toBe("2026-10-06");
  });

  it("todayLocal() agrees with the UTC day for the rest of the IST day", async () => {
    const { todayLocal } = await import("@/lib/utils/dates");
    at("2026-10-06T06:00:00Z"); // 11:30 IST
    expect(todayLocal()).toBe("2026-10-06");
    at("2026-10-06T18:29:00Z"); // 23:59 IST
    expect(todayLocal()).toBe("2026-10-06");
  });
});
