import ExcelJS from "exceljs";
import type { BillPreviewData } from "@/components/bill/bill-preview";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { amountInWords } from "@/lib/utils/numberToWords";

const LAST_COL = 5;
const MUTED = "FF64748B";
const BLUE = "FF0B4EA6";
const RED = "FFA61B1B";

function argb(hex: string) {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

function solidFill(color: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: "thin", color: { argb: "FFCBD5E1" } };
  return { top: side, bottom: side, left: side, right: side };
}

function infoRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  label: string,
  value: string,
  opts?: { bold?: boolean; color?: string },
) {
  const labelCell = sheet.getCell(row, 1);
  labelCell.value = label;
  labelCell.font = { bold: true, size: 10, color: { argb: MUTED } };

  sheet.mergeCells(row, 2, row, LAST_COL);
  const valueCell = sheet.getCell(row, 2);
  valueCell.value = value;
  valueCell.font = opts?.bold
    ? { bold: true, color: opts.color ? { argb: opts.color } : undefined }
    : { size: 10 };
}

function totalsRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  label: string,
  amountText: string,
  opts: { bold?: boolean; color?: string; bg?: string } = {},
) {
  sheet.mergeCells(row, 1, row, 4);
  const labelCell = sheet.getCell(row, 1);
  labelCell.value = label;
  labelCell.alignment = { horizontal: "right" };
  labelCell.font = { bold: !!opts.bold, color: opts.color ? { argb: opts.color } : undefined };

  const amountCell = sheet.getCell(row, LAST_COL);
  amountCell.value = amountText;
  amountCell.alignment = { horizontal: "right" };
  amountCell.font = { bold: !!opts.bold, color: opts.color ? { argb: opts.color } : undefined };

  if (opts.bg) {
    labelCell.fill = solidFill(opts.bg);
    amountCell.fill = solidFill(opts.bg);
  }
}

/** Mirrors BillPreview's layout section-for-section so the Excel download
 * always matches what Print/PDF shows — same content, different file format. */
export function buildBillWorkbook(bill: BillPreviewData): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const lh = bill.letterhead;
  const accent = argb(lh.accentColor || "#0B2B5E");
  const isGst = bill.billType === "GST";

  workbook.creator = lh.businessName;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Bill", {
    views: [{ showGridLines: false }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "portrait" },
  });

  sheet.columns = [{ width: 28 }, { width: 20 }, { width: 12 }, { width: 14 }, { width: 16 }];

  let row = 1;

  sheet.mergeCells(row, 1, row, LAST_COL);
  const nameCell = sheet.getCell(row, 1);
  nameCell.value = lh.businessName;
  nameCell.font = { bold: true, size: 16, color: { argb: accent } };
  nameCell.alignment = { horizontal: "center" };
  row++;

  if (lh.businessTagline) {
    sheet.mergeCells(row, 1, row, LAST_COL);
    const c = sheet.getCell(row, 1);
    c.value = lh.businessTagline;
    c.font = { italic: true, size: 9, color: { argb: MUTED } };
    c.alignment = { horizontal: "center" };
    row++;
  }

  const proprietorLine = [
    lh.ownerName ? `Prop.: ${lh.ownerName}` : "",
    lh.businessPhone ? `Mob.: ${lh.businessPhone}` : "",
  ]
    .filter(Boolean)
    .join("   |   ");
  if (proprietorLine) {
    sheet.mergeCells(row, 1, row, LAST_COL);
    const c = sheet.getCell(row, 1);
    c.value = proprietorLine;
    c.font = { size: 10 };
    c.alignment = { horizontal: "center" };
    row++;
  }

  if (lh.businessAddress) {
    sheet.mergeCells(row, 1, row, LAST_COL);
    const c = sheet.getCell(row, 1);
    c.value = lh.businessAddress;
    c.font = { size: 10, color: { argb: MUTED } };
    c.alignment = { horizontal: "center" };
    row++;
  }

  row += 1;

  // Bill No. / Date
  const billNoLabel = sheet.getCell(row, 1);
  billNoLabel.value = "Bill No.:";
  billNoLabel.font = { bold: true, size: 10, color: { argb: MUTED } };
  const billNoValue = sheet.getCell(row, 2);
  billNoValue.value = bill.billNumber;
  billNoValue.font = { bold: true, color: { argb: accent } };
  const dateLabel = sheet.getCell(row, 4);
  dateLabel.value = "Date:";
  dateLabel.font = { bold: true, size: 10, color: { argb: MUTED } };
  const dateValue = sheet.getCell(row, 5);
  dateValue.value = formatDate(bill.billDate);
  row += 2;

  // Customer block
  infoRow(sheet, row++, "M/s.:", bill.customerName, { bold: true, color: accent });
  infoRow(sheet, row++, "Address:", bill.customerAddress || "—");
  if (bill.showCustomerPhone !== false) {
    infoRow(sheet, row++, "Phone:", bill.customerMobile || "—");
  }
  if (isGst) {
    infoRow(sheet, row++, "GST No.:", bill.buyerGstin || "—");
  }
  row += 1;

  // Items table header
  const headers = ["Machine", "Site / Period", "Hours", "Rate", "Amount"];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = solidFill(accent);
    cell.alignment = { horizontal: i >= 2 ? "right" : "left", vertical: "middle" };
    cell.border = thinBorder();
  });
  row++;

  const isDirect = bill.isDirect === true;
  const bucketAmount = (bill.bucketHours ?? 0) * (bill.bucketRate ?? 0);
  const breakerAmount = (bill.breakerHours ?? 0) * (bill.breakerRate ?? 0);

  const writeItemRow = (
    values: [number, unknown, "left" | "right"][],
    bg: string,
  ) => {
    values.forEach(([col, value, align]) => {
      const cell = sheet.getCell(row, col);
      cell.value = value as string | number;
      cell.alignment = { horizontal: align, vertical: "top", wrapText: true };
      cell.fill = solidFill(bg);
      cell.border = thinBorder();
      if (col === 2) cell.font = { size: 10 };
    });
    row++;
  };

  if (isDirect) {
    const period =
      bill.fromDate && bill.toDate ? `${formatDate(bill.fromDate)} – ${formatDate(bill.toDate)}` : "";
    writeItemRow(
      [
        [1, `Hiring Of ${bill.excavatorName ?? ""}${bill.machineNumber ? ` (${bill.machineNumber})` : ""}`, "left"],
        [2, period, "left"],
        [3, "", "right"],
        [4, "", "right"],
        [5, "", "right"],
      ],
      "FFFFFFFF",
    );
    if ((bill.bucketHours ?? 0) > 0) {
      writeItemRow(
        [
          [1, "Bucket Hours", "left"],
          [2, "", "left"],
          [3, bill.bucketHours ?? 0, "right"],
          [4, formatCurrency(bill.bucketRate ?? 0), "right"],
          [5, formatCurrency(bucketAmount), "right"],
        ],
        "FFF8FAFC",
      );
    }
    if ((bill.breakerHours ?? 0) > 0) {
      writeItemRow(
        [
          [1, "Breaker Hours", "left"],
          [2, "", "left"],
          [3, bill.breakerHours ?? 0, "right"],
          [4, formatCurrency(bill.breakerRate ?? 0), "right"],
          [5, formatCurrency(breakerAmount), "right"],
        ],
        "FFFFFFFF",
      );
    }
  } else {
    bill.items.forEach((item, i) => {
      const bg = i % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC";
      writeItemRow(
        [
          [1, `${item.excavatorName}${item.machineNumber ? ` (${item.machineNumber})` : ""}`, "left"],
          [2, `${item.siteName}\n${formatDate(item.fromDate)} – ${formatDate(item.toDate)}`, "left"],
          [3, item.hours, "right"],
          [4, formatCurrency(item.ratePerHour), "right"],
          [5, formatCurrency(item.amount), "right"],
        ],
        bg,
      );
    });
  }

  totalsRow(sheet, row++, "Sub Total", formatCurrency(bill.subtotal), { bold: true, color: accent });

  const extraCharges = (
    [
      ["Transportation", bill.transportCharges],
      ["Fuel", bill.fuelCharges],
      ["Extra Charges", bill.extraCharges],
      ["Bucket Charge", bill.bucketCharge],
      ["Breaker Charge", bill.breakerCharge],
    ] as [string, number][]
  ).filter(([, amount]) => amount > 0);

  extraCharges.forEach(([label, amount]) => {
    totalsRow(sheet, row++, label, `+ ${formatCurrency(amount)}`, { color: BLUE });
  });

  if (bill.discount > 0) {
    totalsRow(sheet, row++, "Discount", `- ${formatCurrency(bill.discount)}`, { color: RED });
  }

  if (isGst && bill.cgst != null) {
    const half = (bill.gstPercentage ?? 0) / 2;
    totalsRow(sheet, row++, `CGST (${half}%)`, `+ ${formatCurrency(bill.cgst)}`, { color: BLUE });
    totalsRow(sheet, row++, `SGST (${half}%)`, `+ ${formatCurrency(bill.sgst ?? 0)}`, { color: BLUE });
  }

  if (isDirect && (bill.dieselAdvance ?? 0) > 0) {
    totalsRow(
      sheet,
      row++,
      `Diesel Advance (${bill.dieselLiters} L x ${formatCurrency(bill.dieselPricePerLiter ?? 0)})`,
      `- ${formatCurrency(bill.dieselAdvance ?? 0)}`,
      { color: RED },
    );
  }

  totalsRow(sheet, row++, "Grand Total", formatCurrency(bill.totalAmount), {
    bold: true,
    bg: "FFF1F1F1",
  });

  row += 1;
  sheet.mergeCells(row, 1, row, LAST_COL);
  const wordsCell = sheet.getCell(row, 1);
  wordsCell.value = `Amount in Words: ${amountInWords(bill.totalAmount)}`;
  wordsCell.font = { italic: true, size: 10 };
  row += 2;

  if (lh.bankAccount) {
    const bankHeader = sheet.getCell(row, 1);
    bankHeader.value = "BANK DETAILS";
    bankHeader.font = { bold: true, size: 10, color: { argb: accent } };
    row++;

    const bankRows: [string, string][] = [
      ["Bank Name:", lh.bankAccount.bankName],
      ["Branch:", lh.bankAccount.branch || "—"],
      ["Account No:", lh.bankAccount.accountNumber],
      ["IFSC Code:", lh.bankAccount.ifsc],
    ];
    bankRows.forEach(([label, value]) => {
      const l = sheet.getCell(row, 1);
      l.value = label;
      l.font = { bold: true, size: 10, color: { argb: MUTED } };
      const v = sheet.getCell(row, 2);
      v.value = value;
      v.font = { size: 10 };
      row++;
    });
    row++;
  }

  const forLine = sheet.getCell(row, LAST_COL);
  forLine.value = `For ${lh.businessName}`;
  forLine.font = { italic: true, size: 10 };
  forLine.alignment = { horizontal: "right" };
  row++;
  const signLine = sheet.getCell(row, LAST_COL);
  signLine.value = "Authorized Signatory";
  signLine.font = { bold: true, size: 10 };
  signLine.alignment = { horizontal: "right" };
  row += 2;

  if (bill.notes) {
    sheet.mergeCells(row, 1, row, LAST_COL);
    const notesCell = sheet.getCell(row, 1);
    notesCell.value = bill.notes;
    notesCell.font = { size: 9, color: { argb: MUTED } };
    row++;
  }

  sheet.mergeCells(row, 1, row, LAST_COL);
  const footer = sheet.getCell(row, 1);
  footer.value = "Thank you for your business!";
  footer.font = { italic: true, size: 9, color: { argb: MUTED } };
  footer.alignment = { horizontal: "center" };

  return workbook;
}
