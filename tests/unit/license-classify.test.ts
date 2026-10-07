import { describe, expect, it } from "vitest";
import { classify } from "../../scripts/lib/license-classify.mjs";

/**
 * The license gate (`npm run licenses`, a CI step) fails the build only on strong copyleft. Its classifier
 * decides that, so a wrong answer here would let a GPL/AGPL dependency ship silently — or fail the build on a
 * perfectly permissive one. These cases are the SPDX shapes that actually occur in the dependency tree plus the
 * dangerous edge cases.
 */
describe("license classifier", () => {
  it.each([
    "MIT",
    "ISC",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "0BSD",
    "MIT/X11",
    "Unlicense",
    "CC0-1.0",
    "BlueOak-1.0.0",
    "MIT-0",
    "(MIT AND Zlib)",
    "MIT AND ISC",
    "(MIT OR GPL-3.0-or-later)", // the consumer may choose MIT
    "(BSD-2-Clause OR MIT OR Apache-2.0)",
  ])("%s is permissive", (license) => {
    expect(classify(license)).toBe("ok");
  });

  it.each([
    "LGPL-3.0-or-later",
    "LGPL-2.1-only",
    "MPL-2.0",
    "EPL-2.0",
    "CDDL-1.0",
    "Apache-2.0 AND LGPL-3.0-or-later AND MIT", // one weak-copyleft part is enough
    "(GPL-3.0-only OR LGPL-2.1-only)", // the consumer may choose the weaker one
  ])("%s is weak copyleft: reported for a human, not failed", (license) => {
    expect(classify(license)).toBe("weak");
  });

  it.each([
    "GPL-2.0-only",
    "GPL-3.0-or-later",
    "AGPL-3.0-only",
    "SSPL-1.0",
    "EUPL-1.2",
    "gpl-3.0", // case-insensitive
    "GPL-3.0 AND MIT", // one strong part makes the whole thing strong
    "(GPL-2.0-only AND Apache-2.0)",
  ])("%s is strong copyleft: fails the report", (license) => {
    expect(classify(license)).toBe("strong");
  });

  it.each([undefined, null, "", "   ", "SEE LICENSE IN LICENSE.txt", "Proprietary", "Custom"])(
    "%j is unknown: reported for a human, not silently accepted",
    (license) => {
      expect(classify(license as string | undefined)).toBe("unknown");
    },
  );

  it("an unknown part next to a permissive one is unknown, never ok", () => {
    expect(classify("MIT AND Proprietary")).toBe("unknown");
  });

  it("a strong part outranks an unknown one", () => {
    expect(classify("GPL-3.0 AND Proprietary")).toBe("strong");
  });
});
