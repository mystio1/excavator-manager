// Classifies an SPDX license expression for scripts/license-report.mjs. Kept separate so it can be unit-tested
// (tests/unit/license-classify.test.ts): a mistake here would let a copyleft dependency through silently.
//
//   "ok"      permissive: allowed
//   "weak"    weak copyleft (MPL, LGPL, EPL, CDDL...): printed for a human decision, does not fail
//   "unknown" empty or not recognised: printed for a human decision, does not fail
//   "strong"  strong copyleft (GPL, AGPL, SSPL, EUPL...): fails the report
const PERMISSIVE = /^(MIT|MIT\/X11|MIT-0|ISC|0BSD|BSD-[0-9]-Clause|BSD|Apache-2\.0|Unlicense|CC0-1\.0|BlueOak-1\.0\.0|Python-2\.0|CC-BY-[0-9.]+|Zlib|WTFPL|Artistic-2\.0)$/i;
const WEAK = /^(MPL-[0-9.]+|LGPL-[0-9.]+(-only|-or-later)?|EPL-[0-9.]+|CDDL-[0-9.]+|OFL-[0-9.]+)/i;
const STRONG = /^(GPL|AGPL|SSPL|EUPL|OSL|CPAL|RPL)/i;

/** An SPDX expression is acceptable if EVERY "AND" part has at least one acceptable "OR" choice. */
function classify(expression) {
  const raw = String(expression ?? "").trim();
  if (!raw) return "unknown";
  const flat = raw.replace(/[()]/g, " ");
  const verdictOf = (id) => (STRONG.test(id) ? "strong" : WEAK.test(id) ? "weak" : PERMISSIVE.test(id) ? "ok" : "unknown");
  const rank = { ok: 0, weak: 1, unknown: 2, strong: 3 };
  const andParts = flat.split(/\s+AND\s+/i).map((part) => {
    const choices = part.split(/\s+OR\s+/i).map((c) => verdictOf(c.trim()));
    return choices.sort((a, b) => rank[a] - rank[b])[0]; // best choice wins within OR
  });
  return andParts.sort((a, b) => rank[b] - rank[a])[0]; // worst part wins across AND
}

export { classify };
