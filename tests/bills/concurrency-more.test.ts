import "./pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addPayment, createSummaryBill, deleteBill, updateBill } from "@/lib/services/bills";
import { reorderExcavators } from "@/lib/services/excavators";
import { setBusinessFrozen } from "@/lib/services/support";
import { updateBillSchema } from "@/lib/validation/bill";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { ok, summaryInput, uniq } from "./helpers";

/**
 * Concurrency beyond double-billing. Every case fires the competing operations at the same instant
 * (the test pool is small, so some wait their turn — the guarantee is about the OUTCOME, not timing) and
 * then checks the database for a state only one serial order could have produced.
 */

let t: TestTenant;
const day = "2026-10-02";

beforeAll(async () => {
  t = await createTenant("concurrency-more");
});
afterAll(async () => {
  await cleanupTenant(t.businessId);
  await db.$disconnect();
});

async function newBill() {
  const { bill } = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
  const items = await db.billItem.findMany({ where: { billId: bill.id } });
  return { bill, items };
}
const edit = (bill: { billNumber: string }, itemId: string, hours: number, expectedVersion?: number) =>
  updateBillSchema.parse({
    customerId: t.customerId,
    billDate: day,
    billNumber: bill.billNumber,
    billType: "NON_GST",
    expectedVersion,
    items: [{ id: itemId, excavatorId: t.excavatorId, siteName: "S", fromDate: day, toDate: day, hours, ratePerHour: 1000 }],
  });
const codeOf = (r: object) => ("code" in r ? (r as { code?: string }).code : undefined);
const succeeded = (r: object) => !("error" in r);

describe("bill edit vs bill edit", () => {
  it("two edits from the same version: exactly one wins, the other is told the bill changed", async () => {
    const { bill, items } = await newBill();
    const [a, b] = await Promise.all([
      updateBill(t.businessId, t.actor, bill.id, edit(bill, items[0].id, 3, bill.version)),
      updateBill(t.businessId, t.actor, bill.id, edit(bill, items[0].id, 7, bill.version)),
    ]);
    expect([succeeded(a), succeeded(b)].filter(Boolean)).toHaveLength(1);
    expect([codeOf(a), codeOf(b)]).toContain("RESOURCE_MODIFIED");

    const row = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(row.version).toBe(bill.version + 1); // exactly one write landed
    const winner = succeeded(a) ? 3 : 7;
    expect(row.totalAmount.toString()).toBe(String(winner * 1000)); // and it is internally consistent
    expect((await db.billItem.findFirstOrThrow({ where: { billId: bill.id } })).hours.toString()).toBe(String(winner));
  });
});

describe("bill edit vs bill delete", () => {
  it("never both 'succeed' ambiguously: the bill is either gone or edited, never half of each", async () => {
    const { bill, items } = await newBill();
    const [edited, deleted] = await Promise.all([
      updateBill(t.businessId, t.actor, bill.id, edit(bill, items[0].id, 5, bill.version)),
      deleteBill(t.businessId, t.actor, bill.id, { expectedVersion: bill.version }),
    ]);
    const stillThere = await db.bill.findUnique({ where: { id: bill.id } });
    if (succeeded(deleted)) {
      expect(stillThere).toBeNull();
      expect(await db.billItem.count({ where: { billId: bill.id } })).toBe(0); // no orphan lines
      // the edit either ran first (then the delete saw a newer version and could not succeed) or lost with NOT_FOUND
      expect(["NOT_FOUND", undefined]).toContain(codeOf(edited));
      if (succeeded(edited)) throw new Error("edit and delete both succeeded from the same version");
    } else {
      expect(codeOf(deleted)).toBe("RESOURCE_MODIFIED");
      expect(succeeded(edited)).toBe(true);
      expect(stillThere?.totalAmount.toString()).toBe("5000");
    }
  });
});

describe("bill delete vs payment", () => {
  it("leaves no orphan payments and a consistent paid amount, whichever order wins", async () => {
    const { bill } = await newBill();
    const [paid, deleted] = await Promise.all([
      addPayment(t.businessId, t.actor, { billId: bill.id, amount: 100, date: day }),
      deleteBill(t.businessId, t.actor, bill.id),
    ]);
    expect(succeeded(deleted)).toBe(true); // an unversioned delete of an existing bill always lands
    expect(await db.bill.findUnique({ where: { id: bill.id } })).toBeNull();
    expect(await db.payment.count({ where: { billId: bill.id } })).toBe(0); // payment removed with it, or never created
    if (!succeeded(paid)) expect(codeOf(paid)).toBe("NOT_FOUND");
  });
});

describe("summary bills with the same manual number", () => {
  it("one wins, the other gets BILL_NUMBER_TAKEN, and only one bill exists", async () => {
    const number = `DUP-${uniq()}`;
    const run = () => createSummaryBill(t.businessId, t.actor, summaryInput(t, { billNumber: number }));
    const results = await Promise.all([run(), run(), run()]);
    expect(results.filter(succeeded)).toHaveLength(1);
    for (const r of results.filter((x) => !succeeded(x))) expect(codeOf(r)).toBe("BILL_NUMBER_TAKEN");
    expect(await db.bill.count({ where: { businessId: t.businessId, billNumber: number } })).toBe(1);
  });
});

describe("machine reordering", () => {
  it("two reorders at once never leave duplicate or missing positions", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      ids.push((await db.excavator.create({ data: { businessId: t.businessId, name: `Order ${i}`, machineNumber: `ORD-${uniq()}-${i}` } })).id);
    }
    const forward = [...ids];
    const backward = [...ids].reverse();
    for (let round = 0; round < 3; round++) {
      await Promise.all([reorderExcavators(t.businessId, forward), reorderExcavators(t.businessId, backward)]);
      const rows = await db.excavator.findMany({ where: { id: { in: ids } }, select: { id: true, sortOrder: true } });
      const positions = rows.map((r) => r.sortOrder).sort((x, y) => x - y);
      expect(positions).toEqual([1, 2, 3, 4, 5, 6]); // a permutation, never a mix with repeats
      // and the result is exactly one of the two requested orders
      const byPosition = rows.sort((x, y) => x.sortOrder - y.sortOrder).map((r) => r.id);
      expect([JSON.stringify(forward), JSON.stringify(backward)]).toContain(JSON.stringify(byPosition));
    }
  });
});

describe("freeze / unfreeze at the same moment", () => {
  it("each action audits the state it really changed, and the final flag matches the last audit", async () => {
    const code = t.businessCode;
    await db.business.update({ where: { id: t.businessId }, data: { frozen: false } });
    await Promise.all([setBusinessFrozen(code, true, { reason: "freeze race" }), setBusinessFrozen(code, false, { reason: "unfreeze race" })]);

    const audits = await db.auditLog.findMany({
      where: { businessId: t.businessId, action: { in: ["support.freeze", "support.unfreeze"] }, reason: { in: ["freeze race", "unfreeze race"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(audits).toHaveLength(2);
    const business = await db.business.findUniqueOrThrow({ where: { id: t.businessId }, select: { frozen: true } });
    const last = audits[1];
    expect((last.after as { frozen: boolean }).frozen).toBe(business.frozen); // final state == what the last change recorded
    // the second change's "before" is the first change's "after": a chain, not two reads of the same stale value
    expect((audits[1].before as { frozen: boolean }).frozen).toBe((audits[0].after as { frozen: boolean }).frozen);
  });
});
