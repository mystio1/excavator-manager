import { formatCurrency } from "@/lib/utils/currency";
import { summaryTotals, type SummaryRow } from "./summary-rows";
import type { BillPreviewData } from "./bill-preview";

const cell = "px-1.5 py-1 border border-slate-300";
const num = "text-right tabular-nums";

/** 04-06-2026 */
const dmy = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
/** Plain Indian grouping for sheet cells (5280, 1,07,365); paise only when there are any. */
const n = (v: number) =>
  v.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });

/**
 * The Daily Summary bill template: the owner's own summary sheet — one row per working day with
 * the hour-meter readings, hours x rate, work type and the diesel supplied that day — then the
 * Bucket / Breaker hours and the bill's real total (charges, GST and the diesel deduction shown).
 */
export function SummarySheet({ bill, rows, accent }: { bill: BillPreviewData; rows: SummaryRow[]; accent: string }) {
  const dieselRate = bill.dieselPricePerLiter ?? 0;
  const t = summaryTotals(rows, dieselRate);
  const showDiesel = t.dieselLitres > 0 || (bill.dieselLiters ?? 0) > 0;
  const showDieselAmount = showDiesel && dieselRate > 0;
  const machines = [...new Set(rows.map((r) => r.machine))].join(" / ");
  const types = [t.bucketHours > 0 && "Bucket", t.breakerHours > 0 && "Breaker"].filter(Boolean).join("/");
  const cols = 8 + (showDiesel ? 1 : 0) + (showDieselAmount ? 2 : 0);

  const charges = [
    { label: "Transportation", amount: bill.transportCharges },
    { label: "Fuel", amount: bill.fuelCharges },
    { label: "Extra Charges", amount: bill.extraCharges },
    { label: "Bucket Charge", amount: bill.bucketCharge },
    { label: "Breaker Charge", amount: bill.breakerCharge },
  ].filter((c) => c.amount > 0);
  const isGst = bill.billType === "GST" && bill.cgst != null;
  const dieselAdvance = bill.dieselAdvance ?? 0;

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Daily summary">
        <table className="w-full min-w-[720px] border-collapse text-[11px]">
          <thead>
            <tr>
              <th colSpan={cols} className={cell + " text-center text-[12px] font-bold"}>
                Summary : {machines}
                {types ? ` ${types}` : ""}
              </th>
            </tr>
            <tr style={{ backgroundColor: accent }} className="text-white">
              <th className={cell + " text-left"}>Date</th>
              <th className={cell + " text-left"}>Machine</th>
              <th className={cell + " text-right"}>Start</th>
              <th className={cell + " text-right"}>Stop</th>
              <th className={cell + " text-right"}>Hours</th>
              <th className={cell + " text-right"}>Rate</th>
              <th className={cell + " text-right"}>Amount</th>
              <th className={cell + " text-left"}>Type</th>
              {showDiesel && <th className={cell + " text-right"}>Diesel (L)</th>}
              {showDieselAmount && <th className={cell + " text-right"}>Rate</th>}
              {showDieselAmount && <th className={cell + " text-right"}>Amount</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#F8FAFC" }}>
                <td className={cell + " font-semibold whitespace-nowrap"}>
                  {dmy(r.date)}
                  {r.toDate && <span className="block font-normal text-slate-500">to {dmy(r.toDate)}</span>}
                </td>
                <td className={cell}>{r.machine}</td>
                <td className={cell + " " + num}>{r.start != null ? n(r.start) : ""}</td>
                <td className={cell + " " + num}>{r.stop != null ? n(r.stop) : ""}</td>
                <td className={cell + " " + num}>{n(r.hours)}</td>
                <td className={cell + " " + num}>{n(r.rate)}</td>
                <td className={cell + " " + num}>{n(r.amount)}</td>
                <td className={cell}>{r.type ?? ""}</td>
                {showDiesel && <td className={cell + " " + num}>{n(r.diesel ?? 0)}</td>}
                {showDieselAmount && <td className={cell + " " + num}>{n(dieselRate)}</td>}
                {showDieselAmount && <td className={cell + " " + num}>{n(Math.round((r.diesel ?? 0) * dieselRate * 100) / 100)}</td>}
              </tr>
            ))}
            <tr className="font-bold" style={{ backgroundColor: "#F1F5F9" }}>
              <td className={cell} />
              <td className={cell}>Total</td>
              <td className={cell} />
              <td className={cell} />
              <td className={cell + " " + num}>{n(t.hours)}</td>
              <td className={cell} />
              <td className={cell + " " + num}>{n(t.amount)}</td>
              <td className={cell} />
              {showDiesel && <td className={cell + " " + num}>{n(t.dieselLitres)}</td>}
              {showDieselAmount && <td className={cell} />}
              {showDieselAmount && <td className={cell + " " + num}>{n(t.dieselAmount)}</td>}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-3 text-[12px] sm:grid-cols-2">
        <table className="w-full border-collapse self-start">
          <tbody>
            <tr>
              <td className={cell + " font-bold"}>Bucket Hours</td>
              <td className={cell + " " + num + " font-bold"}>{n(t.bucketHours)}</td>
            </tr>
            <tr>
              <td className={cell + " font-bold"}>Breaker Hours</td>
              <td className={cell + " " + num + " font-bold"}>{n(t.breakerHours)}</td>
            </tr>
            {t.otherHours > 0 && (
              <tr>
                <td className={cell + " font-bold"}>Other Hours</td>
                <td className={cell + " " + num + " font-bold"}>{n(t.otherHours)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <table className="w-full border-collapse self-start">
          <tbody>
            <Line label="Work Amount" value={bill.subtotal} />
            {charges.map((c) => (
              <Line key={c.label} label={`+ ${c.label}`} value={c.amount} />
            ))}
            {bill.discount > 0 && <Line label="− Discount" value={-bill.discount} />}
            {isGst && (
              <>
                <Line label={`+ CGST (${(bill.gstPercentage ?? 0) / 2}%)`} value={bill.cgst ?? 0} />
                <Line label={`+ SGST (${(bill.gstPercentage ?? 0) / 2}%)`} value={bill.sgst ?? 0} />
              </>
            )}
            {dieselAdvance > 0 && (
              <Line label={`− Diesel (${n(bill.dieselLiters ?? 0)} L × ${n(dieselRate)})`} value={-dieselAdvance} />
            )}
            <tr style={{ backgroundColor: "#F1F1F1" }}>
              <td className={cell + " text-[13px] font-extrabold"}>Total Amount</td>
              <td className={cell + " " + num + " text-[13px] font-extrabold"}>{formatCurrency(bill.totalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {showDiesel && dieselAdvance > 0 && Math.abs(t.dieselLitres - (bill.dieselLiters ?? 0)) > 0.005 && (
        <p className="text-[10px] text-slate-500">
          Diesel recorded day-wise: {n(t.dieselLitres)} L. Diesel deducted on this bill: {n(bill.dieselLiters ?? 0)} L.
        </p>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <td className={cell + " font-semibold"}>{label}</td>
      <td className={cell + " " + num + " font-semibold"}>
        {value < 0 ? `− ${formatCurrency(-value)}` : formatCurrency(value)}
      </td>
    </tr>
  );
}

