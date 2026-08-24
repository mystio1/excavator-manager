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
