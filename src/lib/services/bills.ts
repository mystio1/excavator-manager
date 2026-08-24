import { db } from "@/lib/db";
import type { GenerateBillInput } from "@/lib/validation/bill";
import type { GenerateDirectBillInput } from "@/lib/validation/directBill";
import type { BillPreviewData } from "@/components/bill/bill-preview";
import type { Business, BankAccount, Prisma } from "@/generated/prisma/client";

export type BillLetterhead = {
  businessName: string;
  ownerName: string;
  businessAddress: string | null;
  businessPhone: string;
  businessGstin: string | null;
  businessTagline: string | null;
  logoLeftUrl: string | null;
  logoRightUrl: string | null;
  signatureUrl: string | null;
  accentColor: string;
  bankAccount: {
    label: string;
    accountHolderName: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    branch: string | null;
  } | null;
};

const NON_GST_PREFIX = "NG-";

function buildLetterhead(
  business: Business,
  bankAccount: BankAccount | null,
): BillLetterhead {
  return {
    businessName: business.name,
    ownerName: business.ownerName,
    businessAddress: business.address,
    businessPhone: business.phone,
    businessGstin: business.gstNumber,
    businessTagline: business.billTagline,
    logoLeftUrl: business.logoLeftUrl,
    logoRightUrl: business.logoRightUrl,
    signatureUrl: business.signatureUrl,
    accentColor: business.billAccentColor,
    bankAccount: bankAccount
      ? {
          label: bankAccount.label,
          accountHolderName: bankAccount.accountHolderName,
          accountNumber: bankAccount.accountNumber,
          ifsc: bankAccount.ifsc,
          bankName: bankAccount.bankName,
          branch: bankAccount.branch,
        }
      : null,
  };
}

/** Reserves the next Non-GST bill number unless the owner typed one in
 * manually (e.g. to match a physical bill book) — a manual entry is used
 * as-is and never advances the sequence, so the next auto number picks up
 * where it left off. Shared by both the WorkSession and direct bill flows. */
async function resolveBillNumber(
  tx: Prisma.TransactionClient,
  businessId: string,
  billType: string,
  manualBillNumber: string | undefined,
) {
  if (billType !== "NON_GST") return manualBillNumber ?? "";
  if (manualBillNumber) return manualBillNumber;

  const seq = await tx.billNumberSequence.upsert({
    where: { businessId_type: { businessId, type: "NON_GST" } },
    create: { businessId, type: "NON_GST", prefix: NON_GST_PREFIX, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `${seq.prefix}${String(seq.lastNumber).padStart(4, "0")}`;
}

export async function listUnbilledWorkSessions(
  businessId: string,
  customerId: string,
  filters?: { siteId?: string; excavatorId?: string; from?: string; to?: string },
) {
  return db.workSession.findMany({
    where: {
      businessId,
      customerId,
      status: "COMPLETED",
      billItems: { none: {} },
      ...(filters?.siteId ? { siteId: filters.siteId } : {}),
      ...(filters?.excavatorId ? { excavatorId: filters.excavatorId } : {}),
      ...(filters?.from ? { startDate: { gte: new Date(filters.from) } } : {}),
      // A session's endDate can fall on the "to" day itself, so bound it at
      // the end of that day rather than midnight — otherwise a same-day job
      // would be excluded from its own selected range.
      ...(filters?.to ? { endDate: { lte: new Date(`${filters.to}T23:59:59.999`) } } : {}),
    },
    orderBy: { startDate: "asc" },
    include: {
      excavator: { select: { id: true, name: true, machineNumber: true } },
      site: { select: { name: true } },
    },
  });
}

/** Read-only peek at what the next Non-GST bill number would be — the actual
 * number is only reserved (incremented) inside createBill's transaction. */
export async function previewNextNonGstBillNumber(businessId: string) {
  const seq = await db.billNumberSequence.findUnique({
    where: { businessId_type: { businessId, type: "NON_GST" } },
  });
  const next = (seq?.lastNumber ?? 0) + 1;
  const prefix = seq?.prefix ?? NON_GST_PREFIX;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function createBill(businessId: string, input: GenerateBillInput) {
  const [business, sessions, bankAccount] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: businessId } }),
    db.workSession.findMany({
      where: {
        id: { in: input.workSessionIds },
        businessId,
        customerId: input.customerId,
        status: "COMPLETED",
        billItems: { none: {} },
      },
      include: { excavator: true, site: { select: { name: true } } },
    }),
    input.bankAccountId
      ? db.bankAccount.findFirst({ where: { id: input.bankAccountId, businessId } })
      : Promise.resolve(null),
  ]);

  if (sessions.length !== input.workSessionIds.length) {
    return { error: "One or more selected work records are no longer available to bill" } as const;
  }

  const totalHours = sessions.reduce((sum, s) => sum + s.totalHours, 0);
  const subtotal = Math.round(totalHours * input.ratePerHour * 100) / 100;
  const taxableValue =
    subtotal +
    input.transportCharges +
    input.fuelCharges +
    input.extraCharges +
    input.bucketCharge +
    input.breakerCharge -
    input.discount;

  let cgst: number | null = null;
  let sgst: number | null = null;
  const igst: number | null = null;
  let taxTotal = 0;
  if (input.billType === "GST" && input.gstPercentage) {
    taxTotal = Math.round(((taxableValue * input.gstPercentage) / 100) * 100) / 100;
    cgst = Math.round((taxTotal / 2) * 100) / 100;
    sgst = taxTotal - cgst;
  }

  const totalAmount = Math.round((taxableValue + taxTotal) * 100) / 100;

  const letterhead = buildLetterhead(business, bankAccount);

  try {
    return await db.$transaction(async (tx) => {
      const billNumber = await resolveBillNumber(tx, businessId, input.billType, input.billNumber);

      const bill = await tx.bill.create({
        data: {
          businessId,
          billNumber,
          billType: input.billType,
          customerId: input.customerId,
          bankAccountId: bankAccount?.id ?? null,
          billDate: new Date(input.billDate),
          subtotal,
          transportCharges: input.transportCharges,
          fuelCharges: input.fuelCharges,
          extraCharges: input.extraCharges,
          bucketCharge: input.bucketCharge,
          breakerCharge: input.breakerCharge,
          discount: input.discount,
          gstPercentage: input.billType === "GST" ? input.gstPercentage : null,
          cgst,
          sgst,
          igst,
          buyerGstin: input.buyerGstin || null,
          totalAmount,
          notes: input.notes || null,
          showCustomerPhone: input.showCustomerPhone,
          letterhead: letterhead as object,
          items: {
            create: sessions.map((s) => ({
              excavatorId: s.excavatorId,
              workSessionId: s.id,
              siteName: s.site.name,
              fromDate: s.startDate,
              toDate: s.endDate ?? s.startDate,
              hours: s.totalHours,
              ratePerHour: input.ratePerHour,
              amount: Math.round(s.totalHours * input.ratePerHour * 100) / 100,
            })),
          },
        },
      });

      return { bill } as const;
    });
  } catch {
    return { error: "That bill number is already used — pick a different one" } as const;
  }
}

/** Direct billing — a standalone invoice for bucket/breaker hours hired
 * directly (e.g. a customer hiring a machine for a job outside the normal
 * WorkSession/DailyWorkLog flow), entered by hand instead of picked from
 * logged work history. Diesel the customer supplied is netted off the
 * total as an advance, not billed as a charge. */
export async function createDirectBill(businessId: string, input: GenerateDirectBillInput) {
  const [business, excavator, bankAccount] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: businessId } }),
    db.excavator.findFirst({ where: { id: input.excavatorId, businessId } }),
    input.bankAccountId
      ? db.bankAccount.findFirst({ where: { id: input.bankAccountId, businessId } })
      : Promise.resolve(null),
  ]);

  if (!excavator) {
    return { error: "Machine not found" } as const;
  }

  const bucketAmount = Math.round(input.bucketHours * input.bucketRate * 100) / 100;
  const breakerAmount = Math.round(input.breakerHours * input.breakerRate * 100) / 100;
  const subtotal = Math.round((bucketAmount + breakerAmount) * 100) / 100;
  const taxableValue = Math.round((subtotal + input.transportCharges) * 100) / 100;
  const dieselAdvance = Math.round(input.dieselLiters * input.dieselPricePerLiter * 100) / 100;

  let cgst: number | null = null;
  let sgst: number | null = null;
  const igst: number | null = null;
  let taxTotal = 0;
  if (input.billType === "GST" && input.gstPercentage) {
    taxTotal = Math.round(((taxableValue * input.gstPercentage) / 100) * 100) / 100;
    cgst = Math.round((taxTotal / 2) * 100) / 100;
    sgst = taxTotal - cgst;
  }

  const totalAmount = Math.round((taxableValue + taxTotal - dieselAdvance) * 100) / 100;

  const letterhead = buildLetterhead(business, bankAccount);

  try {
    return await db.$transaction(async (tx) => {
      const billNumber = await resolveBillNumber(tx, businessId, input.billType, input.billNumber);

      const bill = await tx.bill.create({
        data: {
          businessId,
          billNumber,
          billType: input.billType,
          customerId: input.customerId,
          bankAccountId: bankAccount?.id ?? null,
          billDate: new Date(input.billDate),
          subtotal,
          transportCharges: input.transportCharges,
          gstPercentage: input.billType === "GST" ? input.gstPercentage : null,
          cgst,
          sgst,
          igst,
          buyerGstin: input.buyerGstin || null,
          totalAmount,
          notes: input.notes || null,
          showCustomerPhone: input.showCustomerPhone,
          isDirect: true,
          excavatorId: input.excavatorId,
          fromDate: new Date(input.fromDate),
          toDate: new Date(input.toDate),
          bucketHours: input.bucketHours,
          bucketRate: input.bucketRate,
          breakerHours: input.breakerHours,
          breakerRate: input.breakerRate,
          dieselLiters: input.dieselLiters,
          dieselPricePerLiter: input.dieselPricePerLiter,
          dieselAdvance,
          letterhead: letterhead as object,
        },
      });

      return { bill } as const;
    });
  } catch {
    return { error: "That bill number is already used — pick a different one" } as const;
  }
}

export async function listBills(
  businessId: string,
  filters?: { customerId?: string; isDirect?: boolean },
) {
  return db.bill.findMany({
    where: {
      businessId,
      ...(filters?.customerId ? { customerId: filters.customerId } : {}),
      ...(filters?.isDirect !== undefined ? { isDirect: filters.isDirect } : {}),
    },
    orderBy: { billDate: "desc" },
    include: {
      customer: { select: { name: true, companyName: true } },
      items: { select: { siteName: true, excavator: { select: { name: true, machineNumber: true } } } },
      excavator: { select: { name: true, machineNumber: true } },
    },
  });
}

/** Counts backing the All / Generated by App / Self Generated filter pills
 * on the bills list — kept as a separate lightweight query rather than
 * deriving from listBills's result so switching filters doesn't make the
 * pill counts flicker between different totals. */
export async function countBillsByType(businessId: string, customerId?: string) {
  const where = { businessId, ...(customerId ? { customerId } : {}) };
  const [all, app, self] = await Promise.all([
    db.bill.count({ where }),
    db.bill.count({ where: { ...where, isDirect: false } }),
    db.bill.count({ where: { ...where, isDirect: true } }),
  ]);
  return { all, app, self };
}

export async function getBillDetail(businessId: string, id: string) {
  const bill = await db.bill.findFirst({
    where: { id, businessId },
    include: {
      customer: true,
      items: { include: { excavator: { select: { name: true, machineNumber: true } } } },
      excavator: { select: { name: true, machineNumber: true } },
      payments: { orderBy: { date: "desc" } },
    },
  });
  return bill;
}

/** Shared by the on-screen/print preview and the Excel export so both
 * always render the exact same bill content. */
export function toBillPreviewData(bill: NonNullable<Awaited<ReturnType<typeof getBillDetail>>>): BillPreviewData {
  return {
    billNumber: bill.billNumber,
    billType: bill.billType,
    billDate: bill.billDate,
    customerName: bill.customer.name,
    customerAddress: bill.customer.address,
    customerMobile: bill.customer.mobile,
    showCustomerPhone: bill.showCustomerPhone,
    buyerGstin: bill.buyerGstin,
    items: bill.items.map((item) => ({
      excavatorName: item.excavator.name,
      machineNumber: item.excavator.machineNumber,
      siteName: item.siteName,
      fromDate: item.fromDate,
      toDate: item.toDate,
      hours: item.hours,
      ratePerHour: item.ratePerHour,
      amount: item.amount,
    })),
    subtotal: bill.subtotal,
    transportCharges: bill.transportCharges,
    fuelCharges: bill.fuelCharges,
    extraCharges: bill.extraCharges,
    bucketCharge: bill.bucketCharge,
    breakerCharge: bill.breakerCharge,
    discount: bill.discount,
    gstPercentage: bill.gstPercentage,
    cgst: bill.cgst,
    sgst: bill.sgst,
    igst: bill.igst,
    totalAmount: bill.totalAmount,
    notes: bill.notes,
    letterhead: bill.letterhead as unknown as BillLetterhead,
    isDirect: bill.isDirect,
    excavatorName: bill.excavator?.name,
    machineNumber: bill.excavator?.machineNumber,
    fromDate: bill.fromDate,
    toDate: bill.toDate,
    bucketHours: bill.bucketHours,
    bucketRate: bill.bucketRate,
    breakerHours: bill.breakerHours,
    breakerRate: bill.breakerRate,
    dieselLiters: bill.dieselLiters,
    dieselPricePerLiter: bill.dieselPricePerLiter,
    dieselAdvance: bill.dieselAdvance,
  };
}

export async function addPayment(
  businessId: string,
  input: { billId: string; amount: number; date: string; method?: string; notes?: string },
) {
  const bill = await db.bill.findFirst({ where: { id: input.billId, businessId } });
  if (!bill) return { error: "Bill not found" } as const;

  const remaining = bill.totalAmount - bill.paidAmount;
  if (input.amount > remaining + 0.01) {
    return { error: `Amount exceeds the pending balance of ₹${remaining.toFixed(2)}` } as const;
  }

  await db.$transaction([
    db.payment.create({
      data: {
        businessId,
        billId: bill.id,
        amount: input.amount,
        date: new Date(input.date),
        method: input.method || null,
        notes: input.notes || null,
      },
    }),
    db.bill.update({
      where: { id: bill.id },
      data: {
        paidAmount: { increment: input.amount },
        status:
          bill.paidAmount + input.amount >= bill.totalAmount - 0.01
            ? "PAID"
            : "PARTIAL",
      },
    }),
  ]);

  return { success: true } as const;
}
