/**
 * Pure rules of the bill editor: totals, what blocks submitting, the request
 * body, and the row-building helpers behind Quick Fill / paste / duplicate.
 *
 * No React and no server imports (the exact-Decimal server code cannot run in
 * the browser). Money goes through ../money-preview, which works in integer
 * paise so the preview matches what the server stores. The server stays the
 * source of truth: it re-validates and recomputes everything on save.
 */
import { todayLocal } from "@/lib/utils/dates";
import { fromPaise, gstTaxPaise, lineAmountPaise, lineAmountRupees, toPaise } from "../money-preview";
import type { BillFields, BillTotals, BillType, DirectFields, QuickFillParams, Row } from "./types";

export const TAX_RATES = [5, 12, 18, 28] as const;

/** Quick Fill creates at most this many days per machine, so a typo'd year
 * cannot freeze the page. */
export const MAX_QUICK_FILL_DAYS = 62;

/** Typed text -> number; blank or garbage counts as 0. */
export const num = (s: string): number => Number(s) || 0;

/** Local calendar day (see todayLocal): the UTC date is yesterday in India before 05:30 IST. */
export const todayIso = (): string => todayLocal();

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every ISO day from `from` to `to` inclusive, capped at MAX_QUICK_FILL_DAYS. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  for (let i = 0; i < MAX_QUICK_FILL_DAYS && cur <= to; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export const rowAmount = (r: Pick<Row, "hours" | "rate">): number => lineAmountRupees(num(r.hours), num(r.rate));

// ---- totals ---------------------------------------------------------------

export function computeTotals(input: {
  isDirect: boolean;
  rows: Row[];
  direct: DirectFields;
  fields: Pick<
    BillFields,
    "transport" | "fuel" | "extra" | "bucket" | "breaker" | "discount" | "billType" | "gstPercentage"
  >;
}): BillTotals {
  const { isDirect, rows, direct, fields } = input;
  let subtotal: number;
  let charges: number;
  let discount = 0;
  let dieselAdvance = 0;
  if (isDirect) {
    subtotal =
      lineAmountPaise(num(direct.bucketHours), num(direct.bucketRate)) +
      lineAmountPaise(num(direct.breakerHours), num(direct.breakerRate));
    charges = toPaise(num(fields.transport));
    dieselAdvance = lineAmountPaise(num(direct.dieselLiters), num(direct.dieselPricePerLiter));
  } else {
    subtotal = rows.reduce((s, r) => s + lineAmountPaise(num(r.hours), num(r.rate)), 0);
    charges =
      toPaise(num(fields.transport)) +
      toPaise(num(fields.fuel)) +
      toPaise(num(fields.extra)) +
      toPaise(num(fields.bucket)) +
      toPaise(num(fields.breaker));
    discount = toPaise(num(fields.discount));
  }
  const taxable = subtotal + charges - discount;
  const tax = fields.billType === "GST" ? gstTaxPaise(taxable, fields.gstPercentage) : 0;
  // Hours are summed in hundredths so 8.1 + 8.2 reads 16.3, not 16.299999999999997.
  const hours = rows.reduce((s, r) => s + toPaise(num(r.hours)), 0);
  return {
    subtotal: fromPaise(subtotal),
    charges: fromPaise(charges),
    discount: fromPaise(discount),
    taxable: fromPaise(taxable),
    tax: fromPaise(tax),
    hours: fromPaise(hours),
    dieselAdvance: fromPaise(dieselAdvance),
    total: fromPaise(taxable + tax - dieselAdvance),
  };
}

// ---- validation -----------------------------------------------------------

/** Editing a bill, or any GST bill, always needs a typed bill number; a new
 * non-GST bill is numbered automatically unless the user opts to type one. */
export function billNumberEntry(mode: "create" | "edit", billType: BillType): "typed" | "auto-or-manual" {
  return mode === "edit" || billType === "GST" ? "typed" : "auto-or-manual";
}

/** Whether the bill number comes from the user (rather than the server). */
function numberIsTyped(mode: "create" | "edit", f: Pick<BillFields, "billType" | "manualNumber">): boolean {
  return billNumberEntry(mode, f.billType) === "typed" || f.manualNumber;
}

/** Why the bill cannot be saved yet, as a short message for the user, or null
 * when it can. The single place that decides whether Save is enabled. */
export function submitBlocker(input: {
  mode: "create" | "edit";
  isDirect: boolean;
  fields: Pick<BillFields, "customerId" | "billType" | "manualNumber" | "billNumber">;
  rows: Row[];
}): string | null {
  const { mode, isDirect, fields, rows } = input;
  if (!fields.customerId) return "Choose a customer";
  if (!isDirect) {
    if (rows.length === 0) return "Add at least one row";
    if (rows.some((r) => !r.excavatorId || !r.siteName.trim() || num(r.hours) <= 0)) {
      return "Every row needs a machine, a site and hours";
    }
  }
  if (numberIsTyped(mode, fields) && fields.billNumber.trim() === "") return "Enter the bill number";
  return null;
}

// ---- request body ---------------------------------------------------------

/** The JSON the create (Summary Bill) and edit (PATCH) endpoints take. The
 * idempotency key / expectedVersion are added by the caller. */
export function buildPayload(input: {
  mode: "create" | "edit";
  isDirect: boolean;
  fields: BillFields;
  direct: DirectFields;
  rows: Row[];
}): Record<string, unknown> {
  const { mode, isDirect, fields: f, direct, rows } = input;
  // A new non-GST bill is numbered by the server unless the user chose to type
  // a number; whatever sits in the box (say, from a GST bill typed earlier and
  // since switched away from) must not become the number.
  const common = {
    customerId: f.customerId,
    billDate: f.billDate,
    billType: f.billType,
    billNumber: numberIsTyped(mode, f) ? f.billNumber.trim() || undefined : undefined,
    gstPercentage: f.billType === "GST" ? f.gstPercentage : undefined,
    buyerGstin: f.buyerGstin.trim() || undefined,
    bankAccountId: f.bankAccountId || undefined,
    notes: f.notes.trim() || undefined,
    showCustomerPhone: f.showCustomerPhone,
    transportCharges: num(f.transport),
  };
  if (isDirect) {
    return {
      ...common,
      excavatorId: direct.excavatorId,
      fromDate: direct.fromDate,
      toDate: direct.toDate,
      bucketHours: num(direct.bucketHours),
      bucketRate: num(direct.bucketRate),
      breakerHours: num(direct.breakerHours),
      breakerRate: num(direct.breakerRate),
      dieselLiters: num(direct.dieselLiters),
      dieselPricePerLiter: num(direct.dieselPricePerLiter),
    };
  }
  return {
    ...common,
    items: rows.map((r) => ({
      id: r.id,
      excavatorId: r.excavatorId,
      siteName: r.siteName,
      attachment: r.attachment || undefined,
      fromDate: r.fromDate,
      toDate: r.toDate,
      hours: num(r.hours),
      ratePerHour: num(r.rate),
    })),
    fuelCharges: num(f.fuel),
    extraCharges: num(f.extra),
    bucketCharge: num(f.bucket),
    breakerCharge: num(f.breaker),
    discount: num(f.discount),
  };
}

// ---- row building ---------------------------------------------------------

export type RowContext = {
  makeKey: () => number;
  /** The machine a brand-new row starts with. */
  firstMachineId: string;
  /** A machine's current site name ("" when it has none). */
  siteFor: (excavatorId: string) => string;
  today: string;
};

/** A new row that carries the machine/site/hours/rate of `prev` forward and
 * starts on the next day, so repeated "add row" walks down a date range. */
export function newRowFrom(prev: Row | undefined, ctx: RowContext): Row {
  return {
    key: ctx.makeKey(),
    excavatorId: prev?.excavatorId ?? ctx.firstMachineId,
    siteName: prev?.siteName ?? ctx.siteFor(ctx.firstMachineId),
    fromDate: prev ? addDays(prev.toDate, 1) : ctx.today,
    toDate: prev ? addDays(prev.toDate, 1) : ctx.today,
    hours: prev?.hours ?? "",
    rate: prev?.rate ?? "",
    attachment: prev?.attachment ?? "",
  };
}

/** Switching a row's machine follows the new machine's site, unless the user
 * typed a custom site for the row. */
export function machinePatch(row: Row, excavatorId: string, siteFor: (id: string) => string): Partial<Row> {
  const previousDefault = siteFor(row.excavatorId);
  return {
    excavatorId,
    siteName: !row.siteName || row.siteName === previousDefault ? siteFor(excavatorId) : row.siteName,
  };
}

/** Editing "from" keeps a single-day row single-day and never leaves "to" before it. */
export function fromDatePatch(row: Row, fromDate: string): Partial<Row> {
  return {
    fromDate,
    toDate: row.toDate === row.fromDate || row.toDate < fromDate ? fromDate : row.toDate,
  };
}

/** Values pasted from Excel/Sheets (a column or a row, separated by newlines or
 * tabs). Returns null for anything that is not 2+ numbers, so an ordinary
 * single-value paste keeps its normal behaviour. */
export function parseNumberPaste(text: string): string[] | null {
  const values = text
    .split(/[\r\n\t]+/)
    .map((v) => v.trim().replace(/,/g, ""))
    .filter((v) => v !== "");
  if (values.length < 2 || values.some((v) => Number.isNaN(Number(v)))) return null;
  return values;
}

/** Writes `values` into `col` from `startIndex` downward, adding rows (copied
 * from the last one) as needed. */
export function pasteDown(
  rows: Row[],
  startIndex: number,
  col: "hours" | "rate",
  values: string[],
  ctx: RowContext,
): Row[] {
  const next = [...rows];
  values.forEach((v, i) => {
    const idx = startIndex + i;
    if (idx >= next.length) next.push(newRowFrom(next[next.length - 1], ctx));
    next[idx] = { ...next[idx], [col]: v };
  });
  return next;
}

/** The rows Quick Fill adds: one per day per machine, or one per machine for the
 * whole period. A blank site falls back to each machine's own site. */
export function quickFillRows(
  p: QuickFillParams,
  ctx: Pick<RowContext, "makeKey" | "siteFor">,
): { rows: Row[] } | { error: string } {
  if (p.machineIds.length === 0) return { error: "Pick at least one machine" };
  if (!p.from || !p.to || p.to < p.from) return { error: "Check the dates" };
  if (num(p.hours) <= 0) return { error: "Enter the hours" };
  const days = p.perDay ? daysBetween(p.from, p.to) : null;
  const rows: Row[] = [];
  for (const machineId of p.machineIds) {
    const base = {
      excavatorId: machineId,
      siteName: p.site.trim() || ctx.siteFor(machineId),
      hours: p.hours,
      rate: p.rate,
      attachment: p.attachment,
    };
    if (days) {
      for (const day of days) rows.push({ key: ctx.makeKey(), ...base, fromDate: day, toDate: day });
    } else {
      rows.push({ key: ctx.makeKey(), ...base, fromDate: p.from, toDate: p.to });
    }
  }
  return { rows };
}
