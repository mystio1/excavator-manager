import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { amountInWords } from "@/lib/utils/numberToWords";
import type { BillLetterhead } from "@/lib/services/bills";

export type BillPreviewItem = {
  excavatorName: string;
  machineNumber: string | null;
  siteName: string;
  fromDate: Date;
  toDate: Date;
  hours: number;
  ratePerHour: number;
  amount: number;
};

export type BillPreviewData = {
  billNumber: string;
  billType: string;
  billDate: Date;
  customerName: string;
  customerAddress?: string | null;
  customerMobile?: string | null;
  showCustomerPhone?: boolean;
  buyerGstin?: string | null;
  items: BillPreviewItem[];
  subtotal: number;
  transportCharges: number;
  fuelCharges: number;
  extraCharges: number;
  bucketCharge: number;
  breakerCharge: number;
  discount: number;
  gstPercentage?: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  totalAmount: number;
  notes?: string | null;
  letterhead: BillLetterhead;
  // Direct bill — a standalone invoice for bucket/breaker hours hired
  // directly, entered by hand instead of picked from logged work sessions.
  // When set, the items table renders a "Hiring Of <machine>" line plus
  // Bucket/Breaker Hours rows instead of bill.items, and dieselAdvance is
  // deducted from the total (diesel the customer supplied counts as an
  // advance payment, not a charge).
  isDirect?: boolean;
  excavatorName?: string | null;
  machineNumber?: string | null;
  fromDate?: Date | null;
  toDate?: Date | null;
  bucketHours?: number | null;
  bucketRate?: number | null;
  breakerHours?: number | null;
  breakerRate?: number | null;
  dieselLiters?: number | null;
  dieselPricePerLiter?: number | null;
  dieselAdvance?: number | null;
};

const cell = "px-2 py-1.5 border border-slate-200";

export function BillPreview({ bill }: { bill: BillPreviewData }) {
  const { letterhead: lh } = bill;
  const accent = lh.accentColor || "#0B2B5E";
  const isGst = bill.billType === "GST";
  const proprietorLine = [
    lh.ownerName ? `Prop.: ${lh.ownerName}` : "",
    lh.businessPhone ? `Mob.: ${lh.businessPhone}` : "",
  ]
    .filter(Boolean)
    .join("  |  ");

  const extraCharges = [
    { label: "Transportation", amount: bill.transportCharges },
    { label: "Fuel", amount: bill.fuelCharges },
    { label: "Extra Charges", amount: bill.extraCharges },
    { label: "Bucket Charge", amount: bill.bucketCharge },
    { label: "Breaker Charge", amount: bill.breakerCharge },
  ].filter((c) => c.amount > 0);

  const isDirect = bill.isDirect === true;
  const bucketAmount = (bill.bucketHours ?? 0) * (bill.bucketRate ?? 0);
  const breakerAmount = (bill.breakerHours ?? 0) * (bill.breakerRate ?? 0);

  return (
    <div className="bill-print-area relative overflow-hidden bg-white text-[#1a1a1a]">
      {/* Accent bar */}
      <div className="h-1" style={{ backgroundColor: accent }} />

      <div className="p-4 sm:p-8">
        {/* Header */}
        <div
          className="mb-3 flex items-center justify-center gap-3 border-b-4 pb-3 sm:mb-4 sm:pb-4"
          style={{ borderBottomStyle: "double", borderBottomColor: "#CBD5E1" }}
        >
          <div className="flex h-14 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-24">
            {lh.logoLeftUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lh.logoLeftUrl} alt="" className="max-h-full max-w-full object-contain" />
            )}
          </div>
          <div className="min-w-0 flex-1 text-center">
            <p
              className="text-xl font-extrabold tracking-wide uppercase sm:text-3xl"
              style={{ color: accent }}
            >
              {lh.businessName}
            </p>
            {lh.businessTagline && (
              <p className="mt-0.5 text-[10px] font-bold tracking-[2px] text-slate-400 uppercase sm:text-xs">
                {lh.businessTagline}
              </p>
            )}
            {proprietorLine && <p className="mt-1 text-[11px] font-medium text-slate-600 sm:text-sm">{proprietorLine}</p>}
            {lh.businessAddress && <p className="text-[11px] text-slate-500 sm:text-sm">{lh.businessAddress}</p>}
          </div>
          <div className="flex h-14 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-24">
            {lh.logoRightUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lh.logoRightUrl} alt="" className="max-h-full max-w-full object-contain" />
            )}
          </div>
        </div>

        {/* Customer / Bill info */}
        <div className="mb-4 grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
          <table className="w-full border-collapse">
            <tbody>
              <InfoRow label="M/s.:" value={bill.customerName} bold accent={accent} />
              <InfoRow label="Address:" value={bill.customerAddress || "—"} />
              {bill.showCustomerPhone !== false && (
                <InfoRow label="Phone:" value={bill.customerMobile || "—"} />
              )}
              {isGst && <InfoRow label="GST No.:" value={bill.buyerGstin || "—"} />}
            </tbody>
          </table>
          <table className="w-full border-collapse">
            <tbody>
              <InfoRow label="Bill No.:" value={bill.billNumber} bold accent={accent} />
              <InfoRow label="Date:" value={formatDate(bill.billDate)} />
            </tbody>
          </table>
        </div>

        {/* Items table */}
        <div className="mb-4 w-full overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-[12px]">
            <thead>
              <tr style={{ backgroundColor: accent }}>
                <th className={cell + " text-left text-white"}>Machine</th>
                <th className={cell + " text-left text-white"}>Site / Period</th>
                <th className={cell + " text-right text-white"}>Hours</th>
                <th className={cell + " text-right text-white"}>Rate</th>
                <th className={cell + " text-right text-white"}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {isDirect ? (
                <>
                  <tr style={{ backgroundColor: "#fff" }}>
                    <td className={cell} colSpan={2}>
                      <span className="font-semibold">Hiring Of {bill.excavatorName}</span>
                      {bill.machineNumber && (
                        <span className="block text-[10px] text-slate-400">{bill.machineNumber}</span>
                      )}
                    </td>
                    <td className={cell} colSpan={3}>
                      {bill.fromDate && bill.toDate && (
                        <span className="block text-right text-[10px] text-slate-400">
                          {formatDate(bill.fromDate)} – {formatDate(bill.toDate)}
                        </span>
                      )}
                    </td>
                  </tr>
                  {(bill.bucketHours ?? 0) > 0 && (
                    <tr style={{ backgroundColor: "#F8FAFC" }}>
                      <td className={cell} colSpan={2}>
                        Bucket Hours
                      </td>
                      <td className={cell + " text-right tabular-nums"}>{bill.bucketHours}</td>
                      <td className={cell + " text-right tabular-nums"}>{formatCurrency(bill.bucketRate ?? 0)}</td>
                      <td className={cell + " text-right font-semibold tabular-nums"}>
                        {formatCurrency(bucketAmount)}
                      </td>
                    </tr>
                  )}
                  {(bill.breakerHours ?? 0) > 0 && (
                    <tr style={{ backgroundColor: "#fff" }}>
                      <td className={cell} colSpan={2}>
                        Breaker Hours
                      </td>
                      <td className={cell + " text-right tabular-nums"}>{bill.breakerHours}</td>
                      <td className={cell + " text-right tabular-nums"}>{formatCurrency(bill.breakerRate ?? 0)}</td>
                      <td className={cell + " text-right font-semibold tabular-nums"}>
                        {formatCurrency(breakerAmount)}
                      </td>
                    </tr>
                  )}
                </>
              ) : (
                bill.items.map((item, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#F8FAFC" }}>
                    <td className={cell}>
                      {item.excavatorName}
                      {item.machineNumber && (
                        <span className="block text-[10px] text-slate-400">{item.machineNumber}</span>
                      )}
                    </td>
                    <td className={cell}>
                      {item.siteName}
                      <span className="block text-[10px] text-slate-400">
                        {formatDate(item.fromDate)} – {formatDate(item.toDate)}
                      </span>
                    </td>
                    <td className={cell + " text-right tabular-nums"}>{item.hours}</td>
                    <td className={cell + " text-right tabular-nums"}>{formatCurrency(item.ratePerHour)}</td>
                    <td className={cell + " text-right font-semibold tabular-nums"}>{formatCurrency(item.amount)}</td>
                  </tr>
                ))
              )}

              <tr>
                <td colSpan={4} className={cell + " text-right font-bold"} style={{ color: accent }}>
                  Sub Total
                </td>
                <td className={cell + " text-right font-bold tabular-nums"} style={{ color: accent }}>
                  {formatCurrency(bill.subtotal)}
                </td>
              </tr>

              {extraCharges.map((c) => (
                <tr key={c.label}>
                  <td colSpan={4} className={cell + " text-right font-semibold text-[#0B4EA6]"}>
                    {c.label}
                  </td>
                  <td className={cell + " text-right font-bold tabular-nums text-[#0B4EA6]"}>
                    + {formatCurrency(c.amount)}
                  </td>
                </tr>
              ))}

              {bill.discount > 0 && (
                <tr>
                  <td colSpan={4} className={cell + " text-right font-semibold text-[#A61B1B]"}>
                    Discount
                  </td>
                  <td className={cell + " text-right font-bold tabular-nums text-[#A61B1B]"}>
                    - {formatCurrency(bill.discount)}
                  </td>
                </tr>
              )}

              {isGst && bill.cgst != null && (
                <>
                  <tr>
                    <td colSpan={4} className={cell + " text-right font-semibold text-[#0B4EA6]"}>
                      CGST ({(bill.gstPercentage ?? 0) / 2}%)
                    </td>
                    <td className={cell + " text-right font-bold tabular-nums text-[#0B4EA6]"}>
                      + {formatCurrency(bill.cgst)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} className={cell + " text-right font-semibold text-[#0B4EA6]"}>
                      SGST ({(bill.gstPercentage ?? 0) / 2}%)
                    </td>
                    <td className={cell + " text-right font-bold tabular-nums text-[#0B4EA6]"}>
                      + {formatCurrency(bill.sgst ?? 0)}
                    </td>
                  </tr>
                </>
              )}

              {isDirect && (bill.dieselAdvance ?? 0) > 0 && (
                <tr>
                  <td colSpan={4} className={cell + " text-right font-semibold text-[#A61B1B]"}>
                    Diesel Advance ({bill.dieselLiters} L &times; {formatCurrency(bill.dieselPricePerLiter ?? 0)})
                  </td>
                  <td className={cell + " text-right font-bold tabular-nums text-[#A61B1B]"}>
                    - {formatCurrency(bill.dieselAdvance ?? 0)}
                  </td>
                </tr>
              )}

              <tr style={{ backgroundColor: "#F1F1F1" }}>
                <td colSpan={4} className={cell + " text-right text-[13px] font-extrabold"}>
                  Grand Total
                </td>
                <td className={cell + " text-right text-[13px] font-extrabold tabular-nums"}>
                  {formatCurrency(bill.totalAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Amount in words */}
        <div className="mb-4 rounded border border-dashed border-slate-300 bg-slate-50 p-2 text-[12px] text-slate-600">
          <strong>Amount in Words:</strong>{" "}
          <span className="capitalize italic">{amountInWords(bill.totalAmount)}</span>
        </div>

        {/* Bank details + signature — kept together */}
        <div
          className="flex flex-col gap-4 border-t-4 pt-3 text-[12px] text-slate-700 sm:flex-row sm:pt-4"
          style={{ borderTopStyle: "double", borderTopColor: "#CBD5E1" }}
        >
          {lh.bankAccount && (
            <div className="flex-1">
              <p className="mb-1 text-[12px] font-bold" style={{ color: accent }}>
                BANK DETAILS
              </p>
              <table className="w-full text-[11px]">
                <tbody>
                  <BankRow label="Bank Name:" value={lh.bankAccount.bankName} />
                  <BankRow label="Branch:" value={lh.bankAccount.branch || "—"} />
                  <BankRow label="Account No:" value={lh.bankAccount.accountNumber} bold />
                  <BankRow label="IFSC Code:" value={lh.bankAccount.ifsc} bold />
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-col items-start gap-1 sm:min-w-[150px] sm:items-end">
            <p className="mb-1 text-[12px] font-semibold italic text-slate-700">For {lh.businessName}</p>
            {lh.signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lh.signatureUrl} alt="Signature" className="mb-0.5 max-h-12 max-w-[140px] object-contain" />
            ) : (
              <div className="h-9" />
            )}
            <p className="w-[140px] border-t border-slate-500 pt-0.5 text-center text-[11px] font-bold">
              Authorized Signatory
            </p>
          </div>
        </div>

        {bill.notes && <p className="mt-3 text-[11px] text-slate-500">{bill.notes}</p>}

        <p className="mt-4 text-center text-[11px] text-slate-400 italic">Thank you for your business!</p>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: string;
}) {
  return (
    <tr>
      <td className="w-[70px] py-0.5 pr-2 font-semibold text-slate-500">{label}</td>
      <td className={"py-0.5 " + (bold ? "font-bold" : "")} style={bold ? { color: accent } : undefined}>
        {value}
      </td>
    </tr>
  );
}

function BankRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr>
      <td className="w-[100px] py-0.5 font-semibold text-slate-500">{label}</td>
      <td className={bold ? "py-0.5 font-bold text-slate-900" : "py-0.5"}>{value}</td>
    </tr>
  );
}
