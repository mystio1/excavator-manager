import "./pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { archiveCustomer } from "@/lib/services/customers";
import { addBankAccount, archiveBankAccount } from "@/lib/services/settings";
import { createBill, createDirectBill, createSummaryBill, updateBill } from "@/lib/services/bills";
import { approveWorkRequest } from "@/lib/services/operatorWorkRequests";
import { startWork } from "@/lib/services/workSessions";
import { updateBillSchema } from "@/lib/validation/bill";
import { cleanupTenant, createCompletedSession, createTenant, type TestTenant } from "../helpers/tenant";
import { billInput, directInput, failed, ok, summaryInput, uniq } from "./helpers";

/**
 * Invariant: a REMOVED (archived) customer or bank account cannot be chosen for new business.
 * Existing records that already point at one stay editable (so history is never stranded), and
 * completed work that was already done for a since-removed customer can still be billed from the
 * work-record list — there is no "restore customer" action, so blocking that would strand revenue.
 */

let t: TestTenant;
const day = "2026-10-02";

async function newCustomer(name: string) {
  return db.customer.create({ data: { businessId: t.businessId, name, mobile: "9000099999" } });
}
async function archivedCustomer() {
  const c = await newCustomer(`Archived ${uniq()}`);
  ok(await archiveCustomer(t.businessId, t.actor, c.id));
  return c;
}
async function archivedBankAccount() {
  const account = ok(
    await addBankAccount(t.businessId, t.actor, {
      label: `Old ${uniq()}`,
      accountHolderName: "H",
      accountNumber: "12345678",
      ifsc: "TEST0000001",
      bankName: "B",
    }),
  );
  ok(await archiveBankAccount(t.businessId, t.actor, account.id));
  return account;
}

beforeAll(async () => {
  t = await createTenant("archived-refs");
});
afterAll(async () => {
  await cleanupTenant(t.businessId);
  await db.$disconnect();
});

describe("new records cannot reference an archived customer", () => {
  it("summary bill, direct bill, start-work and work-request approval all answer 409 CONFLICT", async () => {
    const c = await archivedCustomer();

    const summary = failed(await createSummaryBill(t.businessId, t.actor, summaryInput(t, { customerId: c.id })));
    expect(summary.code).toBe("CONFLICT");

    const direct = failed(await createDirectBill(t.businessId, t.actor, directInput(t, { customerId: c.id })));
    expect(direct.code).toBe("CONFLICT");

    const machine = await db.excavator.create({ data: { businessId: t.businessId, name: "M", machineNumber: `M-${uniq()}`, currentOperatorId: t.operatorId } });
    const start = failed(
      await startWork(t.businessId, t.actor, { excavatorId: machine.id, customerId: c.id, siteName: "S", startDate: day, startHourMeter: 1 }),
    );
    expect(start.code).toBe("CONFLICT");

    const request = await db.operatorWorkRequest.create({
      data: { businessId: t.businessId, excavatorId: t.excavatorId, operatorId: t.operatorId, startDate: new Date(), startHourMeter: 0, endDate: new Date(), endHourMeter: 5, status: "PENDING" },
    });
    const approve = failed(
      await approveWorkRequest(t.businessId, t.actor, { requestId: request.id, customerId: c.id, siteName: "S", startHourMeter: 0, endHourMeter: 5 }),
    );
    expect(approve.code).toBe("CONFLICT");
    expect((await db.operatorWorkRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("PENDING"); // untouched
  });

  it("nothing was written by any refused attempt", async () => {
    const c = await archivedCustomer();
    failed(await createSummaryBill(t.businessId, t.actor, summaryInput(t, { customerId: c.id })));
    expect(await db.bill.count({ where: { businessId: t.businessId, customerId: c.id } })).toBe(0);
    expect(await db.workSession.count({ where: { businessId: t.businessId, customerId: c.id } })).toBe(0);
  });
});

describe("existing records are not stranded", () => {
  it("a bill created BEFORE its customer was removed stays editable; moving it TO a removed customer is refused", async () => {
    const live = await newCustomer(`Live ${uniq()}`);
    const { bill } = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t, { customerId: live.id })));
    const items = await db.billItem.findMany({ where: { billId: bill.id } });
    const edit = (customerId: string) =>
      updateBillSchema.parse({
        customerId,
        billDate: day,
        billNumber: bill.billNumber,
        billType: "NON_GST",
        items: [{ id: items[0].id, excavatorId: t.excavatorId, siteName: "S", fromDate: day, toDate: day, hours: 3, ratePerHour: 1000 }],
      });

    ok(await archiveCustomer(t.businessId, t.actor, live.id));
    ok(await updateBill(t.businessId, t.actor, bill.id, edit(live.id))); // keeps its (now removed) customer: allowed

    const other = await archivedCustomer();
    expect(failed(await updateBill(t.businessId, t.actor, bill.id, edit(other.id))).code).toBe("CONFLICT");
  });

  it("completed work done for a since-removed customer can still be billed from the work-record list", async () => {
    const c = await newCustomer(`Later removed ${uniq()}`);
    const s = await createCompletedSession(t, { customerId: c.id, totalHours: 6 });
    ok(await archiveCustomer(t.businessId, t.actor, c.id));
    const { bill } = ok(await createBill(t.businessId, t.actor, billInput({ ...t, customerId: c.id }, [s.id], { billNumber: `ARC-${uniq()}` })));
    expect(bill.customerId).toBe(c.id);
  });
});

describe("a removed bank account cannot be put on a bill", () => {
  it("is refused for new summary and direct bills and when switching an existing bill to it", async () => {
    const acct = await archivedBankAccount();
    expect(failed(await createSummaryBill(t.businessId, t.actor, summaryInput(t, { bankAccountId: acct.id }))).code).toBe("CONFLICT");
    expect(failed(await createDirectBill(t.businessId, t.actor, directInput(t, { bankAccountId: acct.id }))).code).toBe("CONFLICT");

    const s = await createCompletedSession(t, { totalHours: 4 });
    expect(failed(await createBill(t.businessId, t.actor, billInput(t, [s.id], { bankAccountId: acct.id }))).code).toBe("CONFLICT");

    const { bill } = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
    const items = await db.billItem.findMany({ where: { billId: bill.id } });
    const switchTo = updateBillSchema.parse({
      customerId: t.customerId,
      billDate: day,
      billNumber: bill.billNumber,
      billType: "NON_GST",
      bankAccountId: acct.id,
      items: [{ id: items[0].id, excavatorId: t.excavatorId, siteName: "S", fromDate: day, toDate: day, hours: 10, ratePerHour: 1000 }],
    });
    expect(failed(await updateBill(t.businessId, t.actor, bill.id, switchTo)).code).toBe("CONFLICT");
  });
});
