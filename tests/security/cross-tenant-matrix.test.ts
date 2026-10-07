import "../bills/pool";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createSummaryBill, addPayment } from "@/lib/services/bills";
import { cleanupTenant, createCompletedSession, createTenant, type TestTenant } from "../helpers/tenant";
import { actAs } from "../bills/session-mock";
import { ctx, req } from "../bills/route-helpers";

import { GET as billGET, PATCH as billPATCH, DELETE as billDELETE } from "@/app/api/bills/[id]/route";
import { GET as billExportGET } from "@/app/api/bills/[id]/export/route";
import { GET as billsRegisterExportGET } from "@/app/api/bills/export/route";
import ExcelJS from "exceljs";
import { POST as payPOST } from "@/app/api/bills/[id]/payments/route";
import { PATCH as payPATCH, DELETE as payDELETE } from "@/app/api/bills/[id]/payments/[paymentId]/route";
import { PATCH as customerPATCH, DELETE as customerDELETE } from "@/app/api/customers/[id]/route";
import { GET as customerDetailGET } from "@/app/api/customers/detail/route";
import { GET as excavatorGET, PATCH as excavatorPATCH, DELETE as excavatorDELETE } from "@/app/api/excavators/[id]/route";
import { GET as workHistoryGET } from "@/app/api/excavators/[id]/work-history/route";
import { GET as serviceTabGET } from "@/app/api/excavators/[id]/service-tab/route";
import { GET as componentGET } from "@/app/api/excavators/[id]/components/[componentId]/route";
import { PATCH as sitePATCH } from "@/app/api/excavators/[id]/site/route";
import { POST as startWorkPOST } from "@/app/api/excavators/[id]/start-work/route";
import { POST as stopWorkPOST } from "@/app/api/excavators/[id]/stop-work/route";
import { POST as dailyLogPOST } from "@/app/api/excavators/[id]/daily-logs/route";
import { POST as serviceRecordPOST } from "@/app/api/excavators/[id]/service-records/route";
import { POST as assignPOST, DELETE as assignDELETE } from "@/app/api/excavators/[id]/assign-operator/route";
import { PATCH as logPATCH, DELETE as logDELETE } from "@/app/api/daily-logs/[logId]/route";
import { POST as logApprovePOST } from "@/app/api/daily-logs/[logId]/approve/route";
import { POST as logRejectPOST } from "@/app/api/daily-logs/[logId]/reject/route";
import { PATCH as sessionPATCH, DELETE as sessionDELETE } from "@/app/api/work-sessions/[id]/route";
import { PATCH as operatorPATCH, DELETE as operatorDELETE } from "@/app/api/operators/[id]/route";
import { PATCH as pinPATCH } from "@/app/api/operators/[id]/pin/route";
import { GET as operatorDetailGET } from "@/app/api/operators/detail/route";
import { GET as txGET, POST as txPOST } from "@/app/api/operators/[id]/transactions/route";
import { PATCH as txPATCH, DELETE as txDELETE } from "@/app/api/operators/[id]/transactions/[transactionId]/route";
import { PATCH as bankPATCH, DELETE as bankDELETE } from "@/app/api/settings/bank-accounts/[id]/route";
import { POST as wrApprovePOST } from "@/app/api/work-requests/[id]/approve/route";
import { POST as wrRejectPOST } from "@/app/api/work-requests/[id]/reject/route";
import { POST as joinApprovePOST } from "@/app/api/operators/join-requests/[requestId]/approve/route";
import { POST as joinDeclinePOST } from "@/app/api/operators/join-requests/[requestId]/decline/route";
import { POST as legacyApprovePOST } from "@/app/api/operators/[id]/approve-join/route";
import { POST as legacyDeclinePOST } from "@/app/api/operators/[id]/decline-join/route";

import { GET as billsListGET } from "@/app/api/bills/route";
import { GET as customersListGET } from "@/app/api/customers/route";
import { GET as operatorsListGET } from "@/app/api/operators/route";
import { GET as excavatorsListGET } from "@/app/api/excavators/route";
import { GET as searchGET } from "@/app/api/search/route";
import { GET as dashboardGET } from "@/app/api/dashboard/route";
import { GET as approvalsGET } from "@/app/api/approvals/route";
import { GET as customerOptionsGET } from "@/app/api/customers/options/route";
import { GET as operatorOptionsGET } from "@/app/api/operators/options/route";
import { GET as billsNewGET } from "@/app/api/bills/new/route";

vi.mock("@/lib/session", () => import("../bills/session-mock"));

/**
 * BOLA / IDOR matrix at the HTTP-handler level (the real route handlers, withApi,
 * the auth guard, validation and services; only the NextAuth cookie lookup is
 * replaced). Tenant A owns a full set of records. Signed in as tenant B, EVERY
 * id-addressed endpoint — reads (detail, export, lists, search, dashboard) and writes
 * (patch, delete, sub-resource creates, approvals) — is called with A's ids and must
 * answer NOT_FOUND, never a 2xx, and A's data must be byte-for-byte unchanged.
 *
 * Request bodies are VALID (so validation cannot mask a missing tenant check): the
 * assertion is on the error CODE (NOT_FOUND), not merely "some 4xx".
 */

let A: TestTenant;
let B: TestTenant;
const marker = randomUUID().slice(0, 8).toUpperCase();
const ids = {} as Record<string, string>;

beforeAll(async () => {
  [A, B] = [await createTenant("xt-a"), await createTenant("xt-b")];
  await db.customer.update({ where: { id: A.customerId }, data: { name: `ACUST-${marker}` } });
  await db.operator.update({ where: { id: A.operatorId }, data: { name: `AOPER-${marker}` } });
  await db.excavator.update({ where: { id: A.excavatorId }, data: { name: `AMACH-${marker}` } });
  const session = await createCompletedSession(A, { totalHours: 5 });
  ids.sessionId = session.id;
  const log = await db.dailyWorkLog.create({
    data: { workSessionId: session.id, date: new Date("2026-10-01"), hoursWorked: 5, source: "ADMIN", status: "APPROVED", startHourMeter: 100, endHourMeter: 105 },
  });
  ids.logId = log.id;
  const pending = await db.dailyWorkLog.create({
    data: { workSessionId: session.id, date: new Date("2026-10-02"), hoursWorked: 1, source: "OPERATOR", status: "PENDING" },
  });
  ids.pendingLogId = pending.id;
  const bill = await createSummaryBill(A.businessId, A.actor, {
    customerId: A.customerId, billDate: "2026-10-04", billType: "NON_GST", billNumber: `ABILL-${marker}`,
    transportCharges: 0, fuelCharges: 0, extraCharges: 0, bucketCharge: 0, breakerCharge: 0, discount: 0, showCustomerPhone: true,
    items: [{ excavatorId: A.excavatorId, siteName: `ASITE-${marker}`, fromDate: "2026-10-01", toDate: "2026-10-01", hours: 2, ratePerHour: 1000 }],
  } as never);
  if ("error" in bill) throw new Error(bill.error);
  ids.billId = bill.bill.id;
  const pay = await addPayment(A.businessId, A.actor, { billId: bill.bill.id, amount: 500, date: "2026-10-04" });
  if ("error" in pay) throw new Error(pay.error);
  ids.paymentId = (await db.payment.findFirstOrThrow({ where: { billId: bill.bill.id } })).id;
  ids.txId = (
    await db.operatorTransaction.create({ data: { businessId: A.businessId, operatorId: A.operatorId, amount: 100, date: new Date("2026-10-01"), businessEffect: "OTHER" } })
  ).id;
  ids.bankId = (
    await db.bankAccount.create({ data: { businessId: A.businessId, label: "A bank", accountHolderName: "A", accountNumber: "1", ifsc: "X", bankName: "Y" } })
  ).id;
  ids.serviceItemId = (await db.serviceItem.create({ data: { businessId: A.businessId, name: `ACOMP-${marker}`, category: "Other" } })).id;
  ids.workRequestId = (
    await db.operatorWorkRequest.create({
      data: { businessId: A.businessId, excavatorId: A.excavatorId, operatorId: A.operatorId, startDate: new Date(), startHourMeter: 0, endDate: new Date(), endHourMeter: 5, status: "PENDING" },
    })
  ).id;
  ids.joinRequestId = (
    await db.operatorJoinRequest.create({
      data: { businessId: A.businessId, name: "Joiner", mobile: "9000012345", pinHash: "h", verificationHash: "", status: "PENDING", expiresAt: new Date(Date.now() + 86_400_000) },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await cleanupTenant(A.businessId);
  await cleanupTenant(B.businessId);
  await db.$disconnect();
}, 180_000);

beforeEach(() => actAs(B));

type Case = { name: string; call: () => Promise<Response> };
const day = "2026-10-05";
const c = (name: string, call: () => Promise<Response>): Case => ({ name, call });

const WRITES_AND_READS = (): Case[] => [
  // ---- bills & payments
  c("GET bill", () => billGET(req("GET", "/x"), ctx({ id: ids.billId }))),
  c("GET bill export", () => billExportGET(req("GET", "/x"), ctx({ id: ids.billId }))),
  c("PATCH bill", () =>
    billPATCH(
      req("PATCH", "/x", { body: { customerId: B.customerId, billDate: day, billNumber: "XT-1", billType: "NON_GST", items: [{ excavatorId: B.excavatorId, siteName: "S", fromDate: day, toDate: day, hours: 1, ratePerHour: 1 }] } }),
      ctx({ id: ids.billId }),
    ),
  ),
  c("DELETE bill", () => billDELETE(req("DELETE", "/x"), ctx({ id: ids.billId }))),
  c("POST payment", () => payPOST(req("POST", "/x", { body: { amount: 1, date: day } }), ctx({ id: ids.billId }))),
  c("PATCH payment", () => payPATCH(req("PATCH", "/x", { body: { amount: 1, date: day } }), ctx({ id: ids.billId, paymentId: ids.paymentId }))),
  c("DELETE payment", () => payDELETE(req("DELETE", "/x"), ctx({ id: ids.billId, paymentId: ids.paymentId }))),
  // ---- customers
  c("GET customer detail", () => customerDetailGET(req("GET", `/x?id=${A.customerId}`), undefined)),
  c("PATCH customer", () => customerPATCH(req("PATCH", "/x", { body: { name: "Hijack", mobile: "9999999999" } }), ctx({ id: A.customerId }))),
  c("DELETE customer", () => customerDELETE(req("DELETE", "/x"), ctx({ id: A.customerId }))),
  // ---- excavators & work
  c("GET excavator", () => excavatorGET(req("GET", "/x"), ctx({ id: A.excavatorId }))),
  c("PATCH excavator", () => excavatorPATCH(req("PATCH", "/x", { body: { name: "Hijack" } }), ctx({ id: A.excavatorId }))),
  c("DELETE excavator", () => excavatorDELETE(req("DELETE", "/x"), ctx({ id: A.excavatorId }))),
  c("GET work history", () => workHistoryGET(req("GET", "/x"), ctx({ id: A.excavatorId }))),
  c("GET service tab", () => serviceTabGET(req("GET", "/x"), ctx({ id: A.excavatorId }))),
  c("GET component", () => componentGET(req("GET", "/x"), ctx({ id: A.excavatorId, componentId: ids.serviceItemId }))),
  c("PATCH site", () => sitePATCH(req("PATCH", "/x", { body: { siteName: "Hijack site" } }), ctx({ id: A.excavatorId }))),
  c("POST start-work", () => startWorkPOST(req("POST", "/x", { body: { customerId: B.customerId, siteName: "S", startDate: day, startHourMeter: 0 } }), ctx({ id: A.excavatorId }))),
  c("POST stop-work", () => stopWorkPOST(req("POST", "/x", { body: { workSessionId: ids.sessionId, endDate: day, endHourMeter: 500 } }), ctx({ id: A.excavatorId }))),
  c("POST daily log", () => dailyLogPOST(req("POST", "/x", { body: { workSessionId: ids.sessionId, date: day, startHourMeter: 1, endHourMeter: 3 } }), ctx({ id: A.excavatorId }))),
  c("POST service record", () =>
    serviceRecordPOST(req("POST", "/x", { body: { serviceDate: day, hourMeterAtService: 1, items: [{ serviceItemId: ids.serviceItemId, action: "Serviced" }] } }), ctx({ id: A.excavatorId })),
  ),
  c("POST assign operator", () => assignPOST(req("POST", "/x", { body: { operatorId: B.operatorId } }), ctx({ id: A.excavatorId }))),
  c("DELETE assign operator", () => assignDELETE(req("DELETE", "/x"), ctx({ id: A.excavatorId }))),
  c("PATCH daily log", () => logPATCH(req("PATCH", "/x", { body: { date: day, startHourMeter: 1, endHourMeter: 4 } }), ctx({ logId: ids.logId }))),
  c("DELETE daily log", () => logDELETE(req("DELETE", "/x"), ctx({ logId: ids.logId }))),
  c("POST approve log", () => logApprovePOST(req("POST", "/x"), ctx({ logId: ids.pendingLogId }))),
  c("POST reject log", () => logRejectPOST(req("POST", "/x"), ctx({ logId: ids.pendingLogId }))),
  c("PATCH work session", () =>
    sessionPATCH(req("PATCH", "/x", { body: { customerId: B.customerId, operatorId: B.operatorId, siteName: "S", startDate: day, startHourMeter: 1 } }), ctx({ id: ids.sessionId })),
  ),
  c("DELETE work session", () => sessionDELETE(req("DELETE", "/x"), ctx({ id: ids.sessionId }))),
  // ---- operators & money
  c("GET operator detail", () => operatorDetailGET(req("GET", `/x?id=${A.operatorId}`), undefined)),
  c("PATCH operator", () => operatorPATCH(req("PATCH", "/x", { body: { name: "Hijack", mobile: "9999999999" } }), ctx({ id: A.operatorId }))),
  c("DELETE operator", () => operatorDELETE(req("DELETE", "/x"), ctx({ id: A.operatorId }))),
  c("PATCH operator PIN (account takeover vector)", () => pinPATCH(req("PATCH", "/x", { body: { canLogin: true, pin: "1234" } }), ctx({ id: A.operatorId }))),
  c("GET operator transactions", () => txGET(req("GET", "/x"), ctx({ id: A.operatorId }))),
  c("POST operator transaction", () => txPOST(req("POST", "/x", { body: { amount: 1, date: day, businessEffect: "OTHER" } }), ctx({ id: A.operatorId }))),
  c("PATCH operator transaction", () => txPATCH(req("PATCH", "/x", { body: { amount: 1, date: day, businessEffect: "OTHER" } }), ctx({ id: A.operatorId, transactionId: ids.txId }))),
  c("DELETE operator transaction", () => txDELETE(req("DELETE", "/x"), ctx({ id: A.operatorId, transactionId: ids.txId }))),
  // ---- settings
  c("PATCH bank account", () =>
    bankPATCH(req("PATCH", "/x", { body: { label: "Hijack", accountHolderName: "H", accountNumber: "9", ifsc: "H", bankName: "H" } }), ctx({ id: ids.bankId })),
  ),
  c("DELETE bank account", () => bankDELETE(req("DELETE", "/x"), ctx({ id: ids.bankId }))),
  // ---- approvals
  c("POST approve work request", () =>
    wrApprovePOST(req("POST", "/x", { body: { newCustomerName: "Evil", siteName: "S", startHourMeter: 0, endHourMeter: 5 } }), ctx({ id: ids.workRequestId })),
  ),
  c("POST reject work request", () => wrRejectPOST(req("POST", "/x", { body: {} }), ctx({ id: ids.workRequestId }))),
  c("POST approve join request", () => joinApprovePOST(req("POST", "/x", { body: {} }), ctx({ requestId: ids.joinRequestId }))),
  c("POST decline join request", () => joinDeclinePOST(req("POST", "/x", { body: {} }), ctx({ requestId: ids.joinRequestId }))),
  c("POST legacy approve-join", () => legacyApprovePOST(req("POST", "/x", { body: {} }), ctx({ id: ids.joinRequestId }))),
  c("POST legacy decline-join", () => legacyDeclinePOST(req("POST", "/x", { body: {} }), ctx({ id: ids.joinRequestId }))),
];

async function snapshotA() {
  const [bill, payment, customer, operator, excavator, session, log, tx, bank, wr, join] = await Promise.all([
    db.bill.findUnique({ where: { id: ids.billId } }),
    db.payment.findUnique({ where: { id: ids.paymentId } }),
    db.customer.findUnique({ where: { id: A.customerId } }),
    db.operator.findUnique({ where: { id: A.operatorId } }),
    db.excavator.findUnique({ where: { id: A.excavatorId } }),
    db.workSession.findUnique({ where: { id: ids.sessionId } }),
    db.dailyWorkLog.findMany({ where: { workSessionId: ids.sessionId }, orderBy: { id: "asc" } }),
    db.operatorTransaction.findUnique({ where: { id: ids.txId } }),
    db.bankAccount.findUnique({ where: { id: ids.bankId } }),
    db.operatorWorkRequest.findUnique({ where: { id: ids.workRequestId } }),
    db.operatorJoinRequest.findUnique({ where: { id: ids.joinRequestId } }),
  ]);
  const counts = {
    bills: await db.bill.count({ where: { businessId: A.businessId } }),
    payments: await db.payment.count({ where: { businessId: A.businessId } }),
    customers: await db.customer.count({ where: { businessId: A.businessId } }),
    sessions: await db.workSession.count({ where: { businessId: A.businessId } }),
    audit: await db.auditLog.count({ where: { businessId: A.businessId } }),
  };
  return JSON.stringify({ bill, payment, customer, operator, excavator, session, log, tx, bank, wr, join, counts });
}

describe("tenant B cannot reach tenant A through ANY id-addressed endpoint", () => {
  it("every read and write answers NOT_FOUND and leaves A's data (and audit trail) untouched", async () => {
    const before = await snapshotA();
    const failures: string[] = [];
    for (const { name, call } of WRITES_AND_READS()) {
      const res = await call();
      const code = (await res.clone().json().catch(() => ({}))).code as string | undefined;
      if (res.status !== 404 || code !== "NOT_FOUND") failures.push(`${name}: HTTP ${res.status} ${code ?? ""}`);
    }
    expect(failures).toEqual([]);
    expect(await snapshotA()).toBe(before);
  }, 180_000);

  it("the matrix covers every id-bearing route in the API: each handler is imported here and actually called (a new one must be added)", async () => {
    // Per route and method, not a count: a new `[id]` handler that is not imported and called by a case in this
    // file fails here, naming it. (The old guard compared two numbers and tolerated four uncovered handlers.)
    const { buildInventory } = await import("../../scripts/lib/route-inventory.mjs");
    const source = fs.readFileSync("tests/security/cross-tenant-matrix.test.ts", "utf8");
    const idRoutes = (buildInventory(".") as { route: string; method: string; principal: string }[]).filter(
      (r) => r.principal !== "NONE" && /\[/.test(r.route) && !r.route.includes("nextauth"),
    );

    const imported = new Map<string, Map<string, string>>(); // route -> method -> local alias
    for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@\/app\/api\/([^"]+)\/route"/g)) {
      const methods = new Map<string, string>();
      for (const part of m[1].split(",")) {
        const mm = part.trim().match(/^(GET|POST|PUT|PATCH|DELETE)(?:\s+as\s+(\w+))?$/);
        if (mm) methods.set(mm[1], mm[2] ?? mm[1]);
      }
      imported.set(m[2], methods);
    }

    const gaps: string[] = [];
    for (const r of idRoutes) {
      const alias = imported.get(r.route)?.get(r.method);
      if (!alias) {
        gaps.push(`${r.route} ${r.method}: not imported by the matrix`);
        continue;
      }
      const calls = (source.match(new RegExp(`\\b${alias}\\(`, "g")) ?? []).length;
      if (calls < 1) gaps.push(`${r.route} ${r.method}: imported as ${alias} but no case calls it`);
    }
    expect(gaps, "id-addressed handlers the isolation matrix does not exercise").toEqual([]);
    expect(idRoutes.length).toBeGreaterThan(40); // the scan itself found the routes
    expect(new Set(WRITES_AND_READS().map((x) => x.name)).size).toBe(WRITES_AND_READS().length); // no duplicate case names
  });
});

describe("lists, search, dashboard and option feeds never leak tenant A to tenant B", () => {
  const listCalls: [string, () => Promise<Response>][] = [
    ["GET /api/bills", () => billsListGET(req("GET", "/x"), undefined)],
    ["GET /api/bills?q=ABILL", () => billsListGET(req("GET", `/x?q=${marker}&limit=50`), undefined)],
    ["GET /api/customers", () => customersListGET(req("GET", "/x"), undefined)],
    ["GET /api/operators", () => operatorsListGET(req("GET", "/x"), undefined)],
    ["GET /api/excavators", () => excavatorsListGET(req("GET", "/x"), undefined)],
    ["GET /api/search (A's customer)", () => searchGET(req("GET", `/x?q=ACUST-${marker}`), undefined)],
    ["GET /api/search (A's machine)", () => searchGET(req("GET", `/x?q=AMACH-${marker}`), undefined)],
    ["GET /api/search (A's operator)", () => searchGET(req("GET", `/x?q=AOPER-${marker}`), undefined)],
    ["GET /api/search (A's bill number)", () => searchGET(req("GET", `/x?q=ABILL-${marker}`), undefined)],
    ["GET /api/dashboard", () => dashboardGET(req("GET", "/x"), undefined)],
    ["GET /api/approvals", () => approvalsGET(req("GET", "/x"), undefined)],
    ["GET /api/customers/options", () => customerOptionsGET(req("GET", "/x"), undefined)],
    ["GET /api/operators/options", () => operatorOptionsGET(req("GET", "/x"), undefined)],
    ["GET /api/bills/new (form feed)", () => billsNewGET(req("GET", "/x"), undefined)],
  ];

  // The register export is a binary .xlsx (a zip), so the text scan below cannot see inside it:
  // open the workbook and look at every cell instead.
  async function registerCells(as: TestTenant) {
    actAs(as);
    const res = await billsRegisterExportGET(req("GET", "/x"), undefined);
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await res.arrayBuffer()) as ArrayBuffer);
    const cells: string[] = [];
    for (const sheet of wb.worksheets) sheet.eachRow((row) => row.eachCell((c) => cells.push(String(c.value ?? ""))));
    return cells.join("\n");
  }

  it("GET /api/bills/export (register workbook) returns nothing of tenant A to tenant B", async () => {
    const asA = await registerCells(A);
    expect(asA, "control: the export must contain A's own bill, or this test proves nothing").toContain(marker);
    const asB = await registerCells(B);
    for (const leaked of [marker, ids.billId, A.customerId]) expect(asB, `leaked ${leaked}`).not.toContain(leaked);
  });

  it.each(listCalls)("%s returns nothing of tenant A", async (_name, call) => {
    actAs(B);
    const res = await call();
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const leaked of [marker, A.customerId, A.operatorId, A.excavatorId, ids.billId, ids.paymentId, ids.sessionId, ids.txId, ids.bankId, A.businessId]) {
      expect(text, `leaked ${leaked}`).not.toContain(leaked);
    }
  });
});
