/**
 * What an admin is about to change, for the "Are you sure you want to change this?" step.
 * Pure (no React, no server imports) so it is unit-tested and usable from any dialog.
 */
export type FieldSpec = { label: string; before: unknown; after: unknown };
export type FieldChange = { label: string; from: string; to: string };

/** Comparable text for a form/DB value: null, undefined and "" are all "nothing". */
export function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function sameValue(before: string, after: string): boolean {
  if (before === after) return true;
  // "8.0" and 8 are the same number; "" never equals "0".
  if (before !== "" && after !== "" && !Number.isNaN(Number(before)) && !Number.isNaN(Number(after))) {
    return Number(before) === Number(after);
  }
  return false;
}

/** Only the fields whose value actually differs, in the given order. */
export function summarizeChanges(specs: FieldSpec[]): FieldChange[] {
  return specs
    .map((s) => ({ label: s.label, from: normalizeValue(s.before), to: normalizeValue(s.after) }))
    .filter((c) => !sameValue(c.from, c.to));
}

/** How an empty value is shown to the person confirming. */
export const showValue = (v: string) => (v === "" ? "—" : v);
