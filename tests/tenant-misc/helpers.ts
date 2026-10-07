import { db } from "@/lib/db";
import { paymentStatus } from "@/lib/money";
import type { TestTenant } from "../helpers/tenant";

let counter = 0;

/** Inserts a bill (and one payment per entry of `payments`) straight into the
 * database, with amounts as exact decimal strings. paidAmount / status follow
 * the payments, exactly as the billing service would leave them. */
export async function insertBill(
  t: TestTenant,
  opts: { customerId?: string; total: string; payments?: string[]; billDate?: Date },
) {
  const payments = opts.payments ?? [];
  // Decimal-safe: add the paise as integers, then format back to 2 dp.
  const paidPaise = payments.reduce((acc, p) => acc + Math.round(Number(p) * 100), 0);
  const paid = (paidPaise / 100).toFixed(2);
  const bill = await db.bill.create({
    data: {
      businessId: t.businessId,
      billNumber: `TST-${Date.now()}-${++counter}`,
      billType: "GST",
      customerId: opts.customerId ?? t.customerId,
      billDate: opts.billDate ?? new Date(),
      subtotal: opts.total,
      totalAmount: opts.total,
      paidAmount: paid,
      status: paymentStatus(paid, opts.total),
      letterhead: {},
    },
  });
  for (const amount of payments) {
    await db.payment.create({
      data: { businessId: t.businessId, billId: bill.id, amount, date: opts.billDate ?? new Date() },
    });
  }
  return bill;
}

export async function insertCustomer(t: TestTenant, name: string, extra: { companyName?: string; mobile?: string } = {}) {
  return db.customer.create({
    data: { businessId: t.businessId, name, mobile: extra.mobile ?? "9444444444", companyName: extra.companyName },
  });
}
