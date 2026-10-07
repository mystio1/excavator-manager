import { endOfMonth, format, startOfMonth } from "date-fns";

export function formatDate(date: Date) {
  return format(date, "d MMM yyyy");
}

export function formatDateTime(date: Date) {
  return format(date, "d MMM yyyy, h:mm a");
}

export function formatTime(date: Date) {
  return format(date, "h:mm a");
}

export function formatDateRange(from: Date, to: Date | null) {
  const fromStr = format(from, "d MMM");
  if (!to) return `${fromStr} – ongoing`;
  return `${fromStr} – ${format(to, "d MMM yyyy")}`;
}

export function currentMonthRange(reference = new Date()) {
  return { start: startOfMonth(reference), end: endOfMonth(reference) };
}

export function toDateInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

/** Today's date as yyyy-MM-dd in the USER'S local timezone — what a date input's
 * default must be. `new Date().toISOString().slice(0, 10)` is the UTC date, which
 * is YESTERDAY in India between 00:00 and 05:30 IST (exactly when operators start
 * work). Use this for "now"; keep toISOString() only for converting a STORED date
 * (stored as UTC midnight of the chosen day) back into an input value. */
export function todayLocal(now = new Date()) {
  return toDateInputValue(now);
}
