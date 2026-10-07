import "./pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createBill, createSummaryBill, deleteBill } from "@/lib/services/bills";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { billInput, failed, makeSessions, ok, summaryInput, uniq } from "./helpers";

/**
 * A work session can be on at most ONE bill. The service checks inside the
 * creating transaction (after locking the sessions) and BillItem.workSessionId
 * is UNIQUE in the database as the backstop - so concurrent requests can never
 * double-bill, and the loser leaves nothing behind.
 */

let t: TestTenant;

beforeAll(async () => {
  t = await createTenant("double-billing");
});

afterAll(async () => {
  await cleanupTenant(t.businessId);
  await db.$disconnect();
});

const billsFor = (sessionId: string) =>
  db.bill.findMany({ where: { businessId: t.businessId, items: { some: { workSessionId: sessionId } } }, include: { items: true } });

describe("double billing", () => {
  it("rejects billing the same work again (sequential)", async () => {
    const [s1] = await makeSessions(t, [8]);
    ok(await createBill(t.businessId, t.actor, billInput(t, [s1.id])));
    const f = failed(await createBill(t.businessId, t.actor, billInput(t, [s1.id])));
    expect(f.code).toBe("WORK_SESSION_ALREADY_BILLED");
    expect(await billsFor(s1.id)).toHaveLength(1);
  });

  it("two concurrent requests for the same work session: exactly one wins, the other gets WORK_SESSION_ALREADY_BILLED", async () => {
    const [s1] = await makeSessions(t, [8]);
    const results = await Promise.all([
      createBill(t.businessId, t.actor, billInput(t, [s1.id], { billNumber: `A-${uniq()}` })),
      createBill(t.businessId, t.actor, billInput(t, [s1.id], { billNumber: `B-${uniq()}` })),
    ]);

    const wins = results.filter((r) => !("error" in r));
    const losses = results.filter((r) => "error" in r);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect(failed(losses[0]).code).toBe("WORK_SESSION_ALREADY_BILLED");

    // Exactly one bill and one set of items exist for that work: no partial bill.
    const bills = await billsFor(s1.id);
    expect(bills).toHaveLength(1);
    expect(bills[0].items).toHaveLength(1);
    expect(await db.billItem.count({ where: { workSessionId: s1.id } })).toBe(1);
    // The loser left no audit entry either.
    const audits = await db.auditLog.count({ where: { businessId: t.businessId, action: "bill.create", entityType: "Bill", entityId: bills[0].id } });
    expect(audits).toBe(1);
  });

  it("the losing request consumes no Non-GST bill number (rolled back with its transaction)", async () => {
    const tenant = await createTenant("double-billing-seq");
    try {
      const [s1] = await makeSessions(tenant, [8]);
      const results = await Promise.all([
        createBill(tenant.businessId, tenant.actor, billInput(tenant, [s1.id])),
        createBill(tenant.businessId, tenant.actor, billInput(tenant, [s1.id])),
      ]);
      expect(results.filter((r) => !("error" in r))).toHaveLength(1);
      const failure = failed(results.find((r) => "error" in r)!);
      expect(failure.code).toBe("WORK_SESSION_ALREADY_BILLED");

      const seq = await db.billNumberSequence.findFirstOrThrow({ where: { businessId: tenant.businessId, type: "NON_GST" } });
      expect(seq.lastNumber).toBe(1);
      expect(await db.bill.count({ where: { businessId: tenant.businessId } })).toBe(1);

      // The next bill continues the sequence with no hole.
      const [s2] = await makeSessions(tenant, [4]);
      const next = ok(await createBill(tenant.businessId, tenant.actor, billInput(tenant, [s2.id])));
      expect(next.bill.billNumber).toBe("NG-0002");
    } finally {
      await cleanupTenant(tenant.businessId);
    }
  });

  it("many concurrent requests for the same work: still exactly one bill", async () => {
    const [s1] = await makeSessions(t, [3]);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createBill(t.businessId, t.actor, billInput(t, [s1.id], { billNumber: `M${i}-${uniq()}` }))),
    );
    expect(results.filter((r) => !("error" in r))).toHaveLength(1);
    for (const r of results.filter((x) => "error" in x)) expect(failed(r).code).toBe("WORK_SESSION_ALREADY_BILLED");
    expect(await billsFor(s1.id)).toHaveLength(1);
  });

  it("50 concurrent requests for the same work session: never more than ONE bill; every other attempt is a clean conflict (or a retryable 'busy'), one bill number consumed", async () => {
    const [s1] = await makeSessions(t, [4]);
    const seqBefore = (await db.billNumberSequence.findFirst({ where: { businessId: t.businessId, type: "NON_GST" } }))?.lastNumber ?? 0;
    // Auto-numbered (no manual number), so every attempt also races for the bill-number sequence.
    // The test pool is tiny (3 connections), so under this burst some attempts can time out waiting
    // for a transaction slot: the API maps that to a retryable 503 (SERVICE_BUSY). Such an attempt
    // committed NOTHING, so it is retried — which is exactly what a client with an Idempotency-Key does.
    const attempt = () =>
      createBill(t.businessId, t.actor, billInput(t, [s1.id])).then(
        (r) => ({ kind: "result" as const, r }),
        (e: unknown) => ({ kind: "busy" as const, e }),
      );
    const burst = await Promise.all(Array.from({ length: 50 }, attempt));
    const busy = burst.filter((o) => o.kind === "busy");
    for (const o of busy) expect((o as { e: { code?: string } }).e.code).toBe("P2028"); // only the documented transient error
    // Invariant that must hold at EVERY moment: at most one bill exists for this work.
    expect((await billsFor(s1.id)).length).toBeLessThanOrEqual(1);
    // Retry the attempts that never got a transaction slot (nothing of theirs was committed).
    const retried = [];
    for (let i = 0; i < busy.length; i++) retried.push(await attempt());
    const outcomes = [...burst.filter((o) => o.kind === "result"), ...retried];
    expect(outcomes.every((o) => o.kind === "result")).toBe(true);
    const results = outcomes.filter((o) => o.kind === "result").map((o) => (o as { r: Awaited<ReturnType<typeof createBill>> }).r);
    const codes = results.filter((r) => "error" in r).map((r) => failed(r).code);
    expect(new Set(codes)).toEqual(new Set(["WORK_SESSION_ALREADY_BILLED"]));
    expect(await billsFor(s1.id)).toHaveLength(1);
    expect(await db.billItem.count({ where: { workSessionId: s1.id } })).toBe(1);
    const seqAfter = (await db.billNumberSequence.findFirst({ where: { businessId: t.businessId, type: "NON_GST" } }))?.lastNumber ?? 0;
    expect(seqAfter - seqBefore).toBe(1); // every rolled-back attempt consumed no bill number
  }, 180_000);

  it("overlapping sets (in opposite orders) cannot double-bill or deadlock", async () => {
    const [s1, s2, s3] = await makeSessions(t, [1, 2, 3]);
    const results = await Promise.all([
      createBill(t.businessId, t.actor, billInput(t, [s1.id, s2.id], { billNumber: `OA-${uniq()}` })),
      createBill(t.businessId, t.actor, billInput(t, [s3.id, s2.id], { billNumber: `OB-${uniq()}` })),
    ]);
    expect(results.filter((r) => !("error" in r))).toHaveLength(1);
    expect(failed(results.find((r) => "error" in r)!).code).toBe("WORK_SESSION_ALREADY_BILLED");
    // s2 is on exactly one bill; the loser's other session stays unbilled.
    expect(await billsFor(s2.id)).toHaveLength(1);
    const winnerIds = results.find((r) => !("error" in r))!;
    const winner = ok(winnerIds);
    const winnerHasS1 = (await billsFor(s1.id)).length === 1;
    const winnerHasS3 = (await billsFor(s3.id)).length === 1;
    expect(winnerHasS1 !== winnerHasS3).toBe(true);
    expect(await db.billItem.count({ where: { billId: winner.bill.id } })).toBe(2);
  });

  it("concurrent requests with the same MANUAL bill number: one wins, the other gets BILL_NUMBER_TAKEN and nothing is left behind", async () => {
    const [a, b] = await makeSessions(t, [1, 1]);
    const number = `RACE-${uniq()}`;
    const results = await Promise.all([
      createBill(t.businessId, t.actor, billInput(t, [a.id], { billNumber: number })),
      createBill(t.businessId, t.actor, billInput(t, [b.id], { billNumber: number })),
    ]);
    expect(results.filter((r) => !("error" in r))).toHaveLength(1);
    expect(failed(results.find((r) => "error" in r)!).code).toBe("BILL_NUMBER_TAKEN");
    expect(await db.bill.count({ where: { businessId: t.businessId, billNumber: number } })).toBe(1);
    // Exactly one of the two sessions was billed; the other is free to bill again.
    const billed = (await billsFor(a.id)).length + (await billsFor(b.id)).length;
    expect(billed).toBe(1);
  });

  it("the database itself refuses a second bill line for the same work session (unique index backstop)", async () => {
    const [s1] = await makeSessions(t, [2]);
    const { bill } = ok(await createBill(t.businessId, t.actor, billInput(t, [s1.id])));
    const other = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));
    await expect(
      db.billItem.create({
        data: {
          billId: other.bill.id,
          excavatorId: t.excavatorId,
          workSessionId: s1.id,
          siteName: "dup",
          fromDate: new Date("2026-10-01"),
          toDate: new Date("2026-10-01"),
          hours: 1,
          ratePerHour: 1,
          amount: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(await db.billItem.count({ where: { workSessionId: s1.id } })).toBe(1);
    expect(bill.id).toBeTruthy();
  });

  it("maps a unique-index violation on workSessionId (a line committed by a writer that bypassed the lock) to WORK_SESSION_ALREADY_BILLED", async () => {
    const [s1] = await makeSessions(t, [2]);
    const host = ok(await createSummaryBill(t.businessId, t.actor, summaryInput(t)));

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let inserted!: () => void;
    const insertedSignal = new Promise<void>((resolve) => (inserted = resolve));

    // A rogue writer inserts a line for the session and keeps its transaction
    // open, so createBill's "unbilled" read cannot see it - only the unique
    // index can stop the second insert.
    const rogue = db.$transaction(async (tx) => {
      await tx.billItem.create({
        data: {
          billId: host.bill.id,
          excavatorId: t.excavatorId,
          workSessionId: s1.id,
          siteName: "rogue",
          fromDate: new Date("2026-10-01"),
          toDate: new Date("2026-10-01"),
          hours: 2,
          ratePerHour: 1,
          amount: 2,
        },
      });
      inserted();
      await gate;
    });
    await insertedSignal;

    const number = `UQ-${uniq()}`;
    const racing = createBill(t.businessId, t.actor, billInput(t, [s1.id], { billNumber: number }));
    await new Promise((resolve) => setTimeout(resolve, 600)); // let it reach the blocked insert
    release();
    await rogue;

    expect(failed(await racing).code).toBe("WORK_SESSION_ALREADY_BILLED");
    expect(await db.bill.count({ where: { businessId: t.businessId, billNumber: number } })).toBe(0);
    expect(await db.billItem.count({ where: { workSessionId: s1.id } })).toBe(1);
  });

  it("deleting a bill frees its work for billing again", async () => {
    const [s1] = await makeSessions(t, [5]);
    const first = ok(await createBill(t.businessId, t.actor, billInput(t, [s1.id])));
    ok(await deleteBill(t.businessId, t.actor, first.bill.id));
    const again = ok(await createBill(t.businessId, t.actor, billInput(t, [s1.id])));
    expect(again.bill.id).not.toBe(first.bill.id);
  });

  it("refuses work that is not completed, or belongs to another customer, with a clear failure", async () => {
    const [s1] = await makeSessions(t, [5]);
    await db.workSession.update({ where: { id: s1.id }, data: { status: "ACTIVE" } });
    const f1 = failed(await createBill(t.businessId, t.actor, billInput(t, [s1.id])));
    expect(f1.code).toBe("CONFLICT");

    const [s2] = await makeSessions(t, [5]);
    const otherCustomer = await db.customer.create({ data: { businessId: t.businessId, name: "Another", mobile: "9555555555" } });
    const f2 = failed(await createBill(t.businessId, t.actor, billInput(t, [s2.id], { customerId: otherCustomer.id })));
    expect(f2.code).toBe("CONFLICT");
    expect(await db.billItem.count({ where: { workSessionId: { in: [s1.id, s2.id] } } })).toBe(0);
  });
});
