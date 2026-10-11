import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { dec, round2, sum, type Decimal, type MoneyInput } from "@/lib/money";

/**
 * Shared bill / payment arithmetic. Customers, the dashboard and Site Analysis all derive
 * "billed / received / pending" from the SAME records (Bill.totalAmount, Bill.paidAmount) through
 * the helpers below, so the figures cannot drift apart.
 *
 *   billed   = sum of Bill.totalAmount
 *   received = sum of Bill.paidAmount (always equals the sum of that bill's payments)
 *   pending  = billed - received
 *
 * Site-level allocation (siteAnalysis.ts): a bill item's share of its bill's payments is
 *   received(item) = item.amount / bill.totalAmount x bill.paidAmount
 * which BILL_PAID_FRACTION_SQL expresses in SQL.
 */

export type BillTotals = { billed: number; received: number; pending: number };

export const EMPTY_BILL_TOTALS: BillTotals = { billed: 0, received: 0, pending: 0 };

/** billed / received / pending from already-summed Decimals, rounded to 2 dp. */
export function toBillTotals(billed: MoneyInput, paid: MoneyInput): BillTotals {
  const b = dec(billed);
  const p = dec(paid);
  return { billed: round2(b).toNumber(), received: round2(p).toNumber(), pending: round2(b.minus(p)).toNumber() };
}

/** Totals for a list of bills (e.g. the bills already loaded for a customer). */
export function sumBills(bills: { totalAmount: MoneyInput; paidAmount: MoneyInput }[]): BillTotals {
  return toBillTotals(
    sum(bills.map((b) => b.totalAmount)),
    sum(bills.map((b) => b.paidAmount)),
  );
}

/** Per-customer sums computed by the database. One query for any number of customers. */
export async function billTotalsByCustomer(businessId: string, customerIds?: string[]) {
  return db.bill.groupBy({
    by: ["customerId"],
    where: { businessId, ...(customerIds ? { customerId: { in: customerIds } } : {}) },
    _sum: { totalAmount: true, paidAmount: true },
  });
}

/** One customer's totals across ALL their bills (and so across all their sites; never summed per site). */
export async function getCustomerBillTotals(businessId: string, customerId: string): Promise<BillTotals> {
  const agg = await db.bill.aggregate({
    where: { businessId, customerId },
    _sum: { totalAmount: true, paidAmount: true },
  });
  return toBillTotals(agg._sum.totalAmount, agg._sum.paidAmount);
}

/** SQL for "what fraction of this bill has been paid" (alias `bl` = Bill). */
export const BILL_PAID_FRACTION_SQL = Prisma.sql`(CASE WHEN bl."totalAmount" > 0 THEN bl."paidAmount" / bl."totalAmount" ELSE 0 END)`;

/** Same fraction for plain numbers (tests / documentation of the rule). */
export function paidFraction(totalAmount: MoneyInput, paidAmount: MoneyInput): Decimal {
  const total = dec(totalAmount);
  return total.gt(0) ? dec(paidAmount).div(total) : dec(0);
}
