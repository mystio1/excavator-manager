import { db } from "@/lib/db";
import { dec, lineAmount, round2, sum } from "@/lib/money";
import type { getBillDetail } from "@/lib/services/bills";
import type { SummaryRow } from "@/components/bill/summary-rows";

type Bill = NonNullable<Awaited<ReturnType<typeof getBillDetail>>>;

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The rows of the Daily Summary bill template: one per working day where the bill's work can be
 * traced to daily readings, otherwise one per bill line. The rows always add up to the bill:
 *
 *  - a line made from a work record (WorkSession) is split into that record's daily readings
 *    (approved readings only — the ones its billed hours are made of) — but only when those readings' hours add
 *    up to the billed hours; if the line's hours were edited on the bill, it stays one row.
 *    Each day's amount is hours x the line's rate, and the last day takes any paisa of rounding so
 *    the days sum to the line's amount exactly;
 *  - a Summary-bill line (no work record) is one row, as entered;
 *  - a Direct bill is a Bucket row and a Breaker row for its period.
 * Start / Stop are the hour-meter readings where recorded; Diesel is the litres recorded that day.
 */
export async function getBillSummaryRows(businessId: string, bill: Bill): Promise<SummaryRow[]> {
  if (bill.isDirect) {
    const name = bill.excavator?.name ?? "";
    const from = bill.fromDate ? day(bill.fromDate) : day(bill.billDate);
    const to = bill.toDate ? day(bill.toDate) : from;
    const rows: SummaryRow[] = [];
    for (const [type, hours, rate] of [
      ["Bucket", bill.bucketHours, bill.bucketRate],
      ["Breaker", bill.breakerHours, bill.breakerRate],
    ] as const) {
      if (!hours || dec(hours).lte(0)) continue;
      rows.push({
        date: from,
        toDate: to !== from ? to : null,
        machine: name,
        start: null,
        stop: null,
        hours: dec(hours).toNumber(),
        rate: dec(rate ?? 0).toNumber(),
        amount: lineAmount(hours, rate ?? 0).toNumber(),
        type,
        diesel: null,
      });
    }
    return rows;
  }

  const sessionIds = bill.items.map((i) => i.workSessionId).filter((x): x is string => !!x);
  const sessions = sessionIds.length
    ? await db.workSession.findMany({
        where: { id: { in: sessionIds }, businessId },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          startHourMeter: true,
          endHourMeter: true,
          dieselLiters: true,
          attachment: true,
          dailyLogs: {
            where: { status: "APPROVED" },
            orderBy: [{ date: "asc" }, { createdAt: "asc" }],
            select: { date: true, startHourMeter: true, endHourMeter: true, hoursWorked: true, attachment: true, dieselLiters: true, kind: true },
          },
        },
      })
    : [];
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const rows: SummaryRow[] = [];
  for (const item of bill.items) {
    const machine = item.excavator.name;
    const rate = dec(item.ratePerHour);
    const session = item.workSessionId ? sessionById.get(item.workSessionId) : undefined;
    const work = session?.dailyLogs.filter((l) => l.kind !== "DIESEL_ONLY" && l.hoursWorked > 0) ?? [];
    const logHours = round2(sum(work.map((l) => l.hoursWorked)));

    if (session && work.length > 0 && logHours.eq(round2(item.hours))) {
      // Diesel-only top-ups still belong to their day's diesel.
      const dieselByDay = new Map<string, number>();
      for (const l of session.dailyLogs) {
        if (l.dieselLiters) dieselByDay.set(day(l.date), (dieselByDay.get(day(l.date)) ?? 0) + l.dieselLiters);
      }
      let remaining = dec(item.amount);
      work.forEach((l, i) => {
        const last = i === work.length - 1;
        const amount = last ? remaining : lineAmount(l.hoursWorked, rate);
        remaining = remaining.minus(amount);
        const d = day(l.date);
        const diesel = dieselByDay.get(d) ?? null;
        dieselByDay.delete(d); // count a day's diesel once
        rows.push({
          date: d,
          toDate: null,
          machine,
          start: l.startHourMeter,
          stop: l.endHourMeter,
          hours: l.hoursWorked,
          rate: rate.toNumber(),
          amount: round2(amount).toNumber(),
          type: l.attachment ?? item.attachment ?? session.attachment,
          diesel,
        });
      });
      // Days with a diesel top-up but no hours still show their litres.
      for (const [d, litres] of dieselByDay) {
        rows.push({ date: d, toDate: null, machine, start: null, stop: null, hours: 0, rate: rate.toNumber(), amount: 0, type: "Diesel only", diesel: litres });
      }
      continue;
    }

    const from = day(item.fromDate);
    const to = day(item.toDate);
    rows.push({
      date: from,
      toDate: to !== from ? to : null,
      machine,
      start: session?.startHourMeter ?? null,
      stop: session?.endHourMeter ?? null,
      hours: dec(item.hours).toNumber(),
      rate: rate.toNumber(),
      amount: dec(item.amount).toNumber(),
      type: item.attachment ?? session?.attachment ?? null,
      diesel: session?.dieselLiters ?? null,
    });
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.machine.localeCompare(b.machine));
}
