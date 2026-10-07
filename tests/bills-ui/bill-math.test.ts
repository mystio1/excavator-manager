import { describe, expect, it } from "vitest";
import {
  MAX_QUICK_FILL_DAYS,
  addDays,
  billNumberEntry,
  buildPayload,
  computeTotals,
  daysBetween,
  fromDatePatch,
  machinePatch,
  newRowFrom,
  num,
  parseNumberPaste,
  pasteDown,
  quickFillRows,
  rowAmount,
  submitBlocker,
  type RowContext,
} from "@/components/bill/editor/bill-math";
import type { BillFields, DirectFields, QuickFillParams, Row } from "@/components/bill/editor/types";

/**
 * Pure tests (no database, no React) for the bill editor's rules: the totals
 * preview, what blocks saving, the request body and the row helpers.
 */

const baseFields: BillFields = {
  customerId: "c1",
  billDate: "2026-10-04",
  transport: "",
  fuel: "",
  extra: "",
  bucket: "",
  breaker: "",
  discount: "",
  billType: "NON_GST",
  gstPercentage: 18,
  manualNumber: false,
  billNumber: "",
  buyerGstin: "",
  bankAccountId: "",
  notes: "",
  showCustomerPhone: true,
};

const emptyDirect: DirectFields = {
  excavatorId: "",
  fromDate: "2026-10-01",
  toDate: "2026-10-02",
  bucketHours: "",
  bucketRate: "",
  breakerHours: "",
  breakerRate: "",
  dieselLiters: "",
  dieselPricePerLiter: "",
};

const row = (over: Partial<Row> = {}): Row => ({
  key: 1,
  excavatorId: "m1",
  siteName: "Site A",
  fromDate: "2026-10-01",
  toDate: "2026-10-01",
  hours: "8",
  rate: "1000",
  attachment: "",
  ...over,
});

function context(): RowContext & { issued: number[] } {
  const issued: number[] = [];
  let next = 100;
  return {
    issued,
    makeKey: () => {
      issued.push(next);
      return next++;
    },
    firstMachineId: "m1",
    siteFor: (id) => ({ m1: "Site One", m2: "Site Two" })[id] ?? "",
    today: "2026-10-04",
  };
}

const totalsFor = (over: Partial<Parameters<typeof computeTotals>[0]> = {}) =>
  computeTotals({ isDirect: false, rows: [], direct: emptyDirect, fields: baseFields, ...over });

describe("num", () => {
  it("treats blank and garbage as 0", () => {
    expect(num("")).toBe(0);
    expect(num("abc")).toBe(0);
    expect(num("12.5")).toBe(12.5);
  });
});

describe("computeTotals", () => {
  it("is all zero for an empty bill", () => {
    expect(totalsFor()).toEqual({
      subtotal: 0,
      charges: 0,
      discount: 0,
      taxable: 0,
      tax: 0,
      hours: 0,
      dieselAdvance: 0,
      total: 0,
    });
  });

  it("sums hours x rate per row, then charges and discount", () => {
    const t = totalsFor({
      rows: [row({ hours: "8", rate: "1000" }), row({ key: 2, hours: "2.5", rate: "1200" })],
      fields: { ...baseFields, transport: "500", fuel: "250", extra: "100", discount: "350" },
    });
    expect(t.subtotal).toBe(11000); // 8000 + 3000
    expect(t.charges).toBe(850);
    expect(t.discount).toBe(350);
    expect(t.taxable).toBe(11500);
    expect(t.tax).toBe(0);
    expect(t.total).toBe(11500);
    expect(t.hours).toBe(10.5);
  });

  it("includes legacy bucket and breaker charges", () => {
    const t = totalsFor({ rows: [row()], fields: { ...baseFields, bucket: "100", breaker: "200" } });
    expect(t.charges).toBe(300);
    expect(t.total).toBe(8300);
  });

  it("adds GST on the taxable amount (after charges and discount)", () => {
    const t = totalsFor({
      rows: [row()],
      fields: { ...baseFields, billType: "GST", gstPercentage: 18, transport: "1000", discount: "500" },
    });
    expect(t.taxable).toBe(8500);
    expect(t.tax).toBe(1530);
    expect(t.total).toBe(10030);
  });

  it("ignores the GST percentage on a non-GST bill", () => {
    const t = totalsFor({ rows: [row()], fields: { ...baseFields, billType: "NON_GST", gstPercentage: 28 } });
    expect(t.tax).toBe(0);
    expect(t.total).toBe(8000);
  });

  it("rounds hours and rate to paise half-up on their shortest decimal form, as the server does", () => {
    // As floats 1.005 * 100 is 100.49999999999999 and 2.675 * 100 is 267.49999999999994.
    expect(totalsFor({ rows: [row({ hours: "1.005", rate: "100" })] }).subtotal).toBe(101);
    expect(totalsFor({ rows: [row({ hours: "2.675", rate: "1" })] }).subtotal).toBe(2.68);
  });

  it("sums hours without float dust", () => {
    const t = totalsFor({ rows: [row({ hours: "8.1" }), row({ key: 2, hours: "8.2" })] });
    expect(t.hours).toBe(16.3);
  });

  it("treats blank hours/rate as zero", () => {
    const t = totalsFor({ rows: [row({ hours: "", rate: "" }), row({ key: 2, hours: "5", rate: "" })] });
    expect(t.subtotal).toBe(0);
    expect(t.hours).toBe(5);
  });

  it("direct bill: bucket + breaker + transport, GST, minus the diesel advance", () => {
    const t = totalsFor({
      isDirect: true,
      direct: {
        ...emptyDirect,
        bucketHours: "10",
        bucketRate: "900",
        breakerHours: "4",
        breakerRate: "1500",
        dieselLiters: "50",
        dieselPricePerLiter: "90",
      },
      fields: { ...baseFields, billType: "GST", gstPercentage: 12, transport: "1000", discount: "9999", fuel: "9999" },
    });
    expect(t.subtotal).toBe(15000);
    expect(t.charges).toBe(1000); // only transport counts on a direct bill
    expect(t.discount).toBe(0); // discount/fuel belong to normal bills
    expect(t.taxable).toBe(16000);
    expect(t.tax).toBe(1920);
    expect(t.dieselAdvance).toBe(4500);
    expect(t.total).toBe(13420);
  });

  it("can go negative when the diesel advance exceeds the bill (the server decides if that is allowed)", () => {
    const t = totalsFor({
      isDirect: true,
      direct: { ...emptyDirect, bucketHours: "1", bucketRate: "100", dieselLiters: "10", dieselPricePerLiter: "100" },
    });
    expect(t.total).toBe(-900);
  });

  it("row amount matches a line of the total", () => {
    expect(rowAmount({ hours: "2.5", rate: "1200" })).toBe(3000);
    expect(rowAmount({ hours: "", rate: "1200" })).toBe(0);
  });
});

describe("billNumberEntry", () => {
  it("is typed when editing and for GST, otherwise auto-or-manual", () => {
    expect(billNumberEntry("edit", "NON_GST")).toBe("typed");
    expect(billNumberEntry("create", "GST")).toBe("typed");
    expect(billNumberEntry("create", "NON_GST")).toBe("auto-or-manual");
  });
});

describe("submitBlocker", () => {
  const ok = { mode: "create" as const, isDirect: false, fields: baseFields, rows: [row()] };

  it("allows a complete auto-numbered bill", () => {
    expect(submitBlocker(ok)).toBeNull();
  });

  it("asks for a customer first", () => {
    expect(submitBlocker({ ...ok, fields: { ...baseFields, customerId: "" }, rows: [] })).toBe("Choose a customer");
  });

  it("needs at least one row", () => {
    expect(submitBlocker({ ...ok, rows: [] })).toBe("Add at least one row");
  });

  it("needs a machine, a site and positive hours on every row", () => {
    const msg = "Every row needs a machine, a site and hours";
    expect(submitBlocker({ ...ok, rows: [row({ excavatorId: "" })] })).toBe(msg);
    expect(submitBlocker({ ...ok, rows: [row({ siteName: "   " })] })).toBe(msg);
    expect(submitBlocker({ ...ok, rows: [row({ hours: "0" })] })).toBe(msg);
    expect(submitBlocker({ ...ok, rows: [row({ hours: "" })] })).toBe(msg);
    expect(submitBlocker({ ...ok, rows: [row(), row({ key: 2, hours: "-1" })] })).toBe(msg);
  });

  it("does not require a rate (a zero-rate line is allowed)", () => {
    expect(submitBlocker({ ...ok, rows: [row({ rate: "" })] })).toBeNull();
  });

  it("needs a typed number for GST bills, in edit mode, and for a manual number", () => {
    const msg = "Enter the bill number";
    expect(submitBlocker({ ...ok, fields: { ...baseFields, billType: "GST" } })).toBe(msg);
    expect(submitBlocker({ ...ok, mode: "edit" })).toBe(msg);
    expect(submitBlocker({ ...ok, fields: { ...baseFields, manualNumber: true } })).toBe(msg);
    expect(submitBlocker({ ...ok, fields: { ...baseFields, manualNumber: true, billNumber: "  " } })).toBe(msg);
    expect(submitBlocker({ ...ok, fields: { ...baseFields, billType: "GST", billNumber: "INV-1" } })).toBeNull();
  });

  it("a direct bill needs no rows", () => {
    expect(submitBlocker({ ...ok, isDirect: true, rows: [] })).toBeNull();
    expect(submitBlocker({ ...ok, isDirect: true, mode: "edit", rows: [] })).toBe("Enter the bill number");
  });
});

describe("buildPayload", () => {
  it("builds a summary-bill body with trimmed text and numeric money", () => {
    const body = buildPayload({
      mode: "create",
      isDirect: false,
      fields: { ...baseFields, notes: "  hello  ", transport: "500", fuel: "25.5", discount: "10", bankAccountId: "b1" },
      direct: emptyDirect,
      rows: [row({ id: "i1", attachment: "Breaker", hours: "2.5", rate: "1200" }), row({ key: 2 })],
    });
    expect(body).toEqual({
      customerId: "c1",
      billDate: "2026-10-04",
      billType: "NON_GST",
      billNumber: undefined,
      gstPercentage: undefined,
      buyerGstin: undefined,
      bankAccountId: "b1",
      notes: "hello",
      showCustomerPhone: true,
      transportCharges: 500,
      items: [
        {
          id: "i1",
          excavatorId: "m1",
          siteName: "Site A",
          attachment: "Breaker",
          fromDate: "2026-10-01",
          toDate: "2026-10-01",
          hours: 2.5,
          ratePerHour: 1200,
        },
        {
          id: undefined,
          excavatorId: "m1",
          siteName: "Site A",
          attachment: undefined,
          fromDate: "2026-10-01",
          toDate: "2026-10-01",
          hours: 8,
          ratePerHour: 1000,
        },
      ],
      fuelCharges: 25.5,
      extraCharges: 0,
      bucketCharge: 0,
      breakerCharge: 0,
      discount: 10,
    });
  });

  it("sends the GST rate and buyer GSTIN only for GST bills", () => {
    const gst = buildPayload({
      mode: "create",
      isDirect: false,
      fields: { ...baseFields, billType: "GST", gstPercentage: 12, billNumber: " INV-9 ", buyerGstin: " 27ABC " },
      direct: emptyDirect,
      rows: [row()],
    });
    expect(gst).toMatchObject({ billType: "GST", gstPercentage: 12, billNumber: "INV-9", buyerGstin: "27ABC" });
    const nonGst = buildPayload({
      mode: "create",
      isDirect: false,
      fields: { ...baseFields, gstPercentage: 12 },
      direct: emptyDirect,
      rows: [row()],
    });
    expect(nonGst).toMatchObject({ billType: "NON_GST", gstPercentage: undefined });
  });

  it("lets the server number a new non-GST bill unless the user typed a number", () => {
    const stale = { ...baseFields, billNumber: "INV-LEFTOVER", manualNumber: false };
    const auto = buildPayload({ mode: "create", isDirect: false, fields: stale, direct: emptyDirect, rows: [row()] });
    expect(auto.billNumber).toBeUndefined();
    const manual = buildPayload({
      mode: "create",
      isDirect: false,
      fields: { ...stale, manualNumber: true, billNumber: "NG-0059" },
      direct: emptyDirect,
      rows: [row()],
    });
    expect(manual.billNumber).toBe("NG-0059");
    const edit = buildPayload({ mode: "edit", isDirect: false, fields: stale, direct: emptyDirect, rows: [row()] });
    expect(edit.billNumber).toBe("INV-LEFTOVER");
  });

  it("builds a direct-bill body without items", () => {
    const body = buildPayload({
      mode: "edit",
      isDirect: true,
      fields: { ...baseFields, billNumber: "NG-0003", transport: "700" },
      direct: { ...emptyDirect, excavatorId: "m9", bucketHours: "6", bucketRate: "800", dieselLiters: "20", dieselPricePerLiter: "92.5" },
      rows: [],
    });
    expect(body).toMatchObject({
      billNumber: "NG-0003",
      transportCharges: 700,
      excavatorId: "m9",
      fromDate: "2026-10-01",
      toDate: "2026-10-02",
      bucketHours: 6,
      bucketRate: 800,
      breakerHours: 0,
      breakerRate: 0,
      dieselLiters: 20,
      dieselPricePerLiter: 92.5,
    });
    expect(body).not.toHaveProperty("items");
    expect(body).not.toHaveProperty("discount");
  });
});

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("lists every day inclusive, and nothing when to < from", () => {
    expect(daysBetween("2026-10-01", "2026-10-03")).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(daysBetween("2026-10-01", "2026-10-01")).toEqual(["2026-10-01"]);
    expect(daysBetween("2026-10-02", "2026-10-01")).toEqual([]);
  });

  it("caps a runaway range", () => {
    expect(daysBetween("2020-01-01", "2030-01-01")).toHaveLength(MAX_QUICK_FILL_DAYS);
  });
});

describe("row helpers", () => {
  it("a new row copies the previous one and moves to the next day", () => {
    const ctx = context();
    const next = newRowFrom(row({ hours: "6", rate: "900", attachment: "Bucket", toDate: "2026-10-03" }), ctx);
    expect(next).toEqual({
      key: 100,
      excavatorId: "m1",
      siteName: "Site A",
      fromDate: "2026-10-04",
      toDate: "2026-10-04",
      hours: "6",
      rate: "900",
      attachment: "Bucket",
    });
    expect(next.id).toBeUndefined();
  });

  it("the first row starts today on the first machine's site", () => {
    const first = newRowFrom(undefined, context());
    expect(first).toMatchObject({
      excavatorId: "m1",
      siteName: "Site One",
      fromDate: "2026-10-04",
      toDate: "2026-10-04",
      hours: "",
      rate: "",
    });
  });

  it("switching machine follows its site unless the site was customised", () => {
    const siteFor = context().siteFor;
    expect(machinePatch(row({ excavatorId: "m1", siteName: "Site One" }), "m2", siteFor)).toEqual({
      excavatorId: "m2",
      siteName: "Site Two",
    });
    expect(machinePatch(row({ excavatorId: "m1", siteName: "" }), "m2", siteFor).siteName).toBe("Site Two");
    expect(machinePatch(row({ excavatorId: "m1", siteName: "Custom" }), "m2", siteFor).siteName).toBe("Custom");
  });

  it("editing 'from' keeps single-day rows single-day and never leaves 'to' before it", () => {
    expect(fromDatePatch(row({ fromDate: "2026-10-01", toDate: "2026-10-01" }), "2026-10-05")).toEqual({
      fromDate: "2026-10-05",
      toDate: "2026-10-05",
    });
    expect(fromDatePatch(row({ fromDate: "2026-10-01", toDate: "2026-10-10" }), "2026-10-05")).toEqual({
      fromDate: "2026-10-05",
      toDate: "2026-10-10",
    });
    expect(fromDatePatch(row({ fromDate: "2026-10-01", toDate: "2026-10-10" }), "2026-10-20").toDate).toBe("2026-10-20");
  });
});

describe("parseNumberPaste", () => {
  it("reads a column or a row of numbers, dropping thousands separators and blanks", () => {
    expect(parseNumberPaste("8\n8.5\r\n9\n")).toEqual(["8", "8.5", "9"]);
    expect(parseNumberPaste("1,000\t1,250.50")).toEqual(["1000", "1250.50"]);
  });

  it("leaves single values and non-numeric text to the browser", () => {
    expect(parseNumberPaste("8")).toBeNull();
    expect(parseNumberPaste("8\nabc")).toBeNull();
    expect(parseNumberPaste("")).toBeNull();
  });
});

describe("pasteDown", () => {
  it("overwrites downward and appends copies of the last row when it runs out", () => {
    const ctx = context();
    const rows = [row({ key: 1, hours: "1" }), row({ key: 2, hours: "2" })];
    const next = pasteDown(rows, 1, "hours", ["10", "11", "12"], ctx);
    expect(next.map((r) => r.hours)).toEqual(["1", "10", "11", "12"]);
    expect(next).toHaveLength(4);
    expect(next[2].fromDate).toBe("2026-10-02"); // day after the last row (10-01)
    expect(next[3].fromDate).toBe("2026-10-03");
    expect(ctx.issued).toEqual([100, 101]);
    expect(rows.map((r) => r.hours)).toEqual(["1", "2"]); // input untouched
  });
});

describe("quickFillRows", () => {
  const params: QuickFillParams = {
    machineIds: ["m1", "m2"],
    from: "2026-10-01",
    to: "2026-10-03",
    hours: "8",
    rate: "1000",
    site: "",
    attachment: "Bucket",
    perDay: true,
  };

  it("creates one row per day per machine (2 machines x 3 days = 6 rows)", () => {
    const result = quickFillRows(params, context());
    if ("error" in result) throw new Error(result.error);
    expect(result.rows).toHaveLength(6);
    expect(result.rows.map((r) => `${r.excavatorId}@${r.fromDate}`)).toEqual([
      "m1@2026-10-01",
      "m1@2026-10-02",
      "m1@2026-10-03",
      "m2@2026-10-01",
      "m2@2026-10-02",
      "m2@2026-10-03",
    ]);
    expect(result.rows.every((r) => r.fromDate === r.toDate && r.hours === "8" && r.rate === "1000")).toBe(true);
    expect(result.rows.every((r) => r.attachment === "Bucket")).toBe(true);
    expect(new Set(result.rows.map((r) => r.key)).size).toBe(6);
    // each machine falls back to its own site
    expect(result.rows[0].siteName).toBe("Site One");
    expect(result.rows[3].siteName).toBe("Site Two");
  });

  it("creates one row per machine for the whole period", () => {
    const result = quickFillRows({ ...params, perDay: false, site: "  Yard  " }, context());
    if ("error" in result) throw new Error(result.error);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ fromDate: "2026-10-01", toDate: "2026-10-03", siteName: "Yard" });
  });

  it("explains what is missing, in order", () => {
    const ctx = context();
    expect(quickFillRows({ ...params, machineIds: [] }, ctx)).toEqual({ error: "Pick at least one machine" });
    expect(quickFillRows({ ...params, to: "2026-09-30" }, ctx)).toEqual({ error: "Check the dates" });
    expect(quickFillRows({ ...params, from: "" }, ctx)).toEqual({ error: "Check the dates" });
    expect(quickFillRows({ ...params, hours: "0" }, ctx)).toEqual({ error: "Enter the hours" });
    expect(quickFillRows({ ...params, hours: "" }, ctx)).toEqual({ error: "Enter the hours" });
    expect(ctx.issued).toEqual([]); // no keys burned on a rejected request
  });

  it("caps a runaway date range per machine", () => {
    const result = quickFillRows({ ...params, machineIds: ["m1"], from: "2026-01-01", to: "2030-01-01" }, context());
    if ("error" in result) throw new Error(result.error);
    expect(result.rows).toHaveLength(MAX_QUICK_FILL_DAYS);
  });
});

describe("bill row limit (resource bound)", () => {
  it("a bill request with more than MAX_BILL_ROWS rows is a validation error", async () => {
    const { generateSummaryBillSchema, MAX_BILL_ROWS } = await import("@/lib/validation/bill");
    const row = { excavatorId: "e", siteName: "s", fromDate: "2026-10-01", toDate: "2026-10-01", hours: 1, ratePerHour: 1 };
    const base = { customerId: "c", billDate: "2026-10-01", billType: "NON_GST" as const, showCustomerPhone: true };
    expect(generateSummaryBillSchema.safeParse({ ...base, items: Array.from({ length: MAX_BILL_ROWS }, () => row) }).success).toBe(true);
    const over = generateSummaryBillSchema.safeParse({ ...base, items: Array.from({ length: MAX_BILL_ROWS + 1 }, () => row) });
    expect(over.success).toBe(false);
  });
});
