/** Shapes and arithmetic of the Daily Summary bill template (shared by server and client). */

export const BILL_TEMPLATES = ["STANDARD", "DAILY_SUMMARY"] as const;
export type BillTemplate = (typeof BILL_TEMPLATES)[number];
export const BILL_TEMPLATE_LABEL: Record<BillTemplate, string> = {
  STANDARD: "Standard (machine-wise)",
  DAILY_SUMMARY: "Daily Summary (day-wise, with readings & diesel)",
};

/** One row of the sheet. Dates are yyyy-MM-dd; `toDate` set when the row covers a period. */
export type SummaryRow = {
  date: string;
  toDate: string | null;
  machine: string;
  start: number | null;
  stop: number | null;
  hours: number;
  rate: number;
  amount: number;
  /** "Bucket" / "Breaker" / anything else recorded, or null. */
  type: string | null;
  /** Diesel litres recorded that day. */
  diesel: number | null;
};

const paise = (n: number) => Math.round(n * 100);

export const isBucket = (t: string | null) => /bucket/i.test(t ?? "");
export const isBreaker = (t: string | null) => /breaker|brekar/i.test(t ?? "");

/** Totals of the sheet. Money summed in whole paise; hours and litres to 2 dp. */
export function summaryTotals(rows: SummaryRow[], dieselRate: number) {
  const hours = (pick: (r: SummaryRow) => boolean) => Math.round(rows.filter(pick).reduce((a, r) => a + r.hours * 100, 0)) / 100;
  const dieselLitres = Math.round(rows.reduce((a, r) => a + (r.diesel ?? 0) * 100, 0)) / 100;
  return {
    hours: hours(() => true),
    bucketHours: hours((r) => isBucket(r.type)),
    breakerHours: hours((r) => isBreaker(r.type)),
    otherHours: hours((r) => !isBucket(r.type) && !isBreaker(r.type)),
    amount: rows.reduce((a, r) => a + paise(r.amount), 0) / 100,
    dieselLitres,
    /** Per-row diesel amounts (litres x rate, each rounded to paise), summed. */
    dieselAmount: rows.reduce((a, r) => a + paise((r.diesel ?? 0) * dieselRate), 0) / 100,
  };
}

const iso = (d: Date) => {
  // Bill dates are UTC midnights from the server, local midnights from a form — either way the
  // calendar day is what is meant.
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return (d.getUTCHours() === 0 ? d : local).toISOString().slice(0, 10);
};

/** Rows for a bill that is not saved yet (Preview): one per line — there are no day readings to
 * split into until the bill exists — or Bucket / Breaker rows for a direct bill. */
export function rowsFromLines(bill: {
  isDirect?: boolean;
  items: { excavatorName: string; attachment?: string | null; fromDate: Date; toDate: Date; hours: number; ratePerHour: number; amount: number }[];
  excavatorName?: string | null;
  fromDate?: Date | null;
  toDate?: Date | null;
  bucketHours?: number | null;
  bucketRate?: number | null;
  breakerHours?: number | null;
  breakerRate?: number | null;
}): SummaryRow[] {
  if (bill.isDirect) {
    const from = bill.fromDate ? iso(bill.fromDate) : "";
    const to = bill.toDate ? iso(bill.toDate) : from;
    return (
      [
        ["Bucket", bill.bucketHours ?? 0, bill.bucketRate ?? 0],
        ["Breaker", bill.breakerHours ?? 0, bill.breakerRate ?? 0],
      ] as const
    )
      .filter(([, h]) => h > 0)
      .map(([type, hours, rate]) => ({
        date: from,
        toDate: to !== from ? to : null,
        machine: bill.excavatorName ?? "",
        start: null,
        stop: null,
        hours,
        rate,
        amount: Math.round(hours * rate * 100) / 100,
        type,
        diesel: null,
      }));
  }
  return bill.items
    .map((i) => {
      const from = iso(i.fromDate);
      const to = iso(i.toDate);
      return {
        date: from,
        toDate: to !== from ? to : null,
        machine: i.excavatorName,
        start: null,
        stop: null,
        hours: i.hours,
        rate: i.ratePerHour,
        amount: i.amount,
        type: i.attachment ?? null,
        diesel: null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.machine.localeCompare(b.machine));
}
