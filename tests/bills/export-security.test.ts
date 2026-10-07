import "./pool";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { createSummaryBill, getBillDetail, listBillsForExport, toBillPreviewData } from "@/lib/services/bills";
import { buildBillsRegisterWorkbook } from "@/lib/services/billExcel";
import { BillPreview, type BillPreviewData } from "@/components/bill/bill-preview";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { actAs } from "./session-mock";
import { req } from "./route-helpers";
import { ok, summaryInput } from "./helpers";

import { GET as registerExportGET } from "@/app/api/bills/export/route";
import { GET as billExportGET } from "@/app/api/bills/[id]/export/route";

vi.mock("@/lib/session", () => import("./session-mock"));

/**
 * Export / print security: bounded, accountable, honest about truncation, never cacheable, and hostile
 * text is shown as text (HTML-escaped in the print view; stored as text cells — not formulas — in Excel,
 * see excel.test.ts).
 */

let t: TestTenant;
let billId: string;

beforeAll(async () => {
  t = await createTenant("export-security");
  actAs(t);
  for (let i = 0; i < 3; i++) {
    const { bill } = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
    billId = bill.id;
  }
});
afterAll(async () => {
  actAs(null);
  await cleanupTenant(t.businessId);
  await db.$disconnect();
});

async function cellsOf(res: Response): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await res.arrayBuffer()) as ArrayBuffer);
  const out: string[] = [];
  for (const sheet of wb.worksheets) sheet.eachRow((row) => row.eachCell((c) => out.push(String(c.value ?? ""))));
  return out;
}

describe("register export", () => {
  it("is cacheable by nobody, and carries no truncation flag when everything fits", async () => {
    const res = await registerExportGET(req("GET", "/api/bills/export"), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/private/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(res.headers.get("x-export-truncated")).toBeNull();
    expect((await cellsOf(res)).some((c) => c.startsWith("INCOMPLETE"))).toBe(false);
  });

  it("reports truncation instead of silently handing over a partial register", async () => {
    const full = await listBillsForExport(t.businessId, {}, { cap: 1000 });
    expect(full.bills).toHaveLength(3);
    expect(full.truncated).toBe(false);

    const capped = await listBillsForExport(t.businessId, {}, { cap: 2 });
    expect(capped.bills).toHaveLength(2);
    expect(capped.truncated).toBe(true);

    // exactly at the cap with nothing more matching is NOT truncated
    const exact = await listBillsForExport(t.businessId, {}, { cap: 3 });
    expect(exact.bills).toHaveLength(3);
    expect(exact.truncated).toBe(false);

    const workbook = buildBillsRegisterWorkbook(capped.bills, { businessName: "Test Business", truncatedAt: capped.cap });
    const cells: string[] = [];
    workbook.worksheets[0].eachRow((row) => row.eachCell((c) => cells.push(String(c.value ?? ""))));
    expect(cells.some((c) => c.startsWith("INCOMPLETE: only the first 2 bills"))).toBe(true);
  });

  it("rejects a malformed date or an unknown filter with 422 instead of reaching the database", async () => {
    for (const qs of ["?from=not-a-date", "?to=2026-13-45", "?filter=everything", "?customerId="]) {
      const res = await registerExportGET(req("GET", `/api/bills/export${qs}`), undefined);
      expect(res.status, qs).toBe(422);
      expect((await res.json()).code).toBe("VALIDATION_FAILED");
    }
  });

  it("writes one audit entry per export: who, filters, how many rows", async () => {
    const before = await db.auditLog.count({ where: { businessId: t.businessId, action: "bills.export" } });
    const res = await registerExportGET(req("GET", "/api/bills/export?from=2000-01-01&filter=app"), undefined);
    expect(res.status).toBe(200);
    const rows = await db.auditLog.findMany({ where: { businessId: t.businessId, action: "bills.export" }, orderBy: { createdAt: "desc" } });
    expect(rows.length).toBe(before + 1);
    expect(rows[0]).toMatchObject({ actorType: "OWNER", actorId: t.userId, entityType: "Bill", entityId: "register" });
    expect(rows[0].details).toMatchObject({ rowCount: 3, truncated: false, filters: { from: "2000-01-01", filter: "app" } });
  });
});

describe("single-bill export", () => {
  it("is audited and not cacheable", async () => {
    const res = await billExportGET(req("GET", "/x"), { params: Promise.resolve({ id: billId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const row = await db.auditLog.findFirst({ where: { businessId: t.businessId, action: "bill.export", entityId: billId } });
    expect(row).toMatchObject({ actorType: "OWNER", entityType: "Bill" });
  });
});

describe("export rate limit", () => {
  it("answers 429 with Retry-After once a business exceeds 20 exports in 10 minutes", async () => {
    const limited = await createTenant("export-limit");
    try {
      actAs(limited);
      let last: Response | undefined;
      let firstBlocked = 0;
      for (let i = 1; i <= 23; i++) {
        last = await registerExportGET(req("GET", "/api/bills/export"), undefined);
        if (last.status === 429 && !firstBlocked) firstBlocked = i;
      }
      expect(firstBlocked).toBeGreaterThan(15); // normal use is not throttled...
      expect(firstBlocked).toBeLessThanOrEqual(22); // ...a burst is
      expect(last!.status).toBe(429);
      expect(last!.headers.get("retry-after")).toBeTruthy();
      expect((await last!.json()).code).toBe("RATE_LIMITED");
    } finally {
      actAs(t);
      await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE ${"export%:" + limited.businessId}`;
      await cleanupTenant(limited.businessId);
    }
  }, 120_000);
});

describe("printed bill (HTML) escapes hostile text", () => {
  const HOSTILE = [`<script>alert("x")</script>`, `"><img src=x onerror=alert(1)>`, `<b onmouseover=alert(1)>hover</b>`];

  it("customer, site, machine, notes and letterhead text render as text, never as markup", async () => {
    const { bill } = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
    const preview: BillPreviewData = {
      ...toBillPreviewData((await getBillDetail(t.businessId, bill.id))!),
      customerName: HOSTILE[0],
      customerAddress: HOSTILE[1],
      notes: HOSTILE[2],
      items: [{ excavatorName: HOSTILE[2], machineNumber: HOSTILE[1], siteName: HOSTILE[0], attachment: HOSTILE[1], fromDate: new Date(), toDate: new Date(), hours: 1, ratePerHour: 1, amount: 1 }],
    };
    preview.letterhead = { ...preview.letterhead, businessName: HOSTILE[0], businessTagline: HOSTILE[2], businessAddress: HOSTILE[1] };

    const html = renderToStaticMarkup(createElement(BillPreview, { bill: preview }));
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b onmouseover");
    expect(html).toContain("&lt;script&gt;alert(");
  });
});
