import { db } from "@/lib/db";
import type { GenerateBillInput, GenerateSummaryBillInput, UpdateBillInput } from "@/lib/validation/bill";
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

/** maxBillsPerDay is support-console-managed (see
 * src/lib/services/support.ts) — null/unset for every business until
 * support deliberately caps one. */
async function checkDailyBillLimit(businessId: string, maxBillsPerDay: number | null) {
  if (maxBillsPerDay == null) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const billsToday = await db.bill.count({ where: { businessId, createdAt: { gte: startOfToday } } });
  if (billsToday >= maxBillsPerDay) {
    return `You've reached your plan's limit of ${maxBillsPerDay} bills per day. Contact support to raise it.` as const;
  }
  return null;
}

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

  const limitError = await checkDailyBillLimit(businessId, business.maxBillsPerDay);
  if (limitError) return { error: limitError } as const;

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
              attachment: input.attachment || null,
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

const round2 = (n: number) => Math.round(n * 100) / 100;

function gstSplit(taxableValue: number, billType: string, gstPercentage: number | null | undefined) {
  if (billType !== "GST" || !gstPercentage) return { taxTotal: 0, cgst: null, sgst: null };
  const taxTotal = round2((taxableValue * gstPercentage) / 100);
  const cgst = round2(taxTotal / 2);
  return { taxTotal, cgst, sgst: taxTotal - cgst };
}

function paymentStatus(paidAmount: number, totalAmount: number) {
  if (paidAmount <= 0) return "UNPAID";
  return paidAmount >= totalAmount - 0.01 ? "PAID" : "PARTIAL";
}

/** Summary Bill — a normal-style bill (customer-wise, per-machine/site
 * lines, hours × rate, optional GST) whose lines are entered directly in a
 * spreadsheet-like grid instead of being picked from already-logged work.
 * Lines carry no workSessionId, so nothing logged elsewhere is touched. */
export async function createSummaryBill(businessId: string, input: GenerateSummaryBillInput) {
  const [business, bankAccount, machines, customer] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: businessId } }),
    input.bankAccountId
      ? db.bankAccount.findFirst({ where: { id: input.bankAccountId, businessId } })
      : Promise.resolve(null),
    db.excavator.findMany({
      where: { businessId, id: { in: input.items.map((i) => i.excavatorId) } },
      select: { id: true },
    }),
    db.customer.findFirst({ where: { id: input.customerId, businessId }, select: { id: true } }),
  ]);

  if (!customer) return { error: "Customer not found" } as const;

  const limitError = await checkDailyBillLimit(businessId, business.maxBillsPerDay);
  if (limitError) return { error: limitError } as const;

  const machineIds = new Set(machines.map((m) => m.id));
  if (input.items.some((i) => !machineIds.has(i.excavatorId))) {
    return { error: "One of the selected machines was not found" } as const;
  }

  const items = input.items.map((i) => ({
    excavatorId: i.excavatorId,
    siteName: i.siteName,
    attachment: i.attachment || null,
    fromDate: new Date(i.fromDate),
    toDate: new Date(i.toDate),
    hours: i.hours,
    ratePerHour: i.ratePerHour,
    amount: round2(i.hours * i.ratePerHour),
  }));
  const subtotal = round2(items.reduce((sum, i) => sum + i.amount, 0));
  const taxableValue =
    subtotal +
    input.transportCharges +
    input.fuelCharges +
    input.extraCharges +
    input.bucketCharge +
    input.breakerCharge -
    input.discount;
  const { taxTotal, cgst, sgst } = gstSplit(taxableValue, input.billType, input.gstPercentage);
  const totalAmount = round2(taxableValue + taxTotal);
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
          igst: null,
          buyerGstin: input.buyerGstin || null,
          totalAmount,
          notes: input.notes || null,
          showCustomerPhone: input.showCustomerPhone,
          letterhead: letterhead as object,
          items: { create: items },
        },
      });
      return { bill } as const;
    });
  } catch {
    return { error: "That bill number is already used — pick a different one" } as const;
  }
}

/** Admin edit of a generated bill — any field, any time. Totals/GST are
 * recomputed from scratch; payments already recorded are kept and the
 * PAID/PARTIAL/UNPAID status is re-derived against the new total. Lines
 * keep their WorkSession link when edited in place (so those hours stay
 * marked as billed); a removed line frees its WorkSession for rebilling. */
export async function updateBill(businessId: string, id: string, input: UpdateBillInput) {
  const bill = await db.bill.findFirst({ where: { id, businessId }, include: { items: true } });
  if (!bill) return { error: "Bill not found" } as const;

  const [bankAccount, customer] = await Promise.all([
    input.bankAccountId
      ? db.bankAccount.findFirst({ where: { id: input.bankAccountId, businessId } })
      : Promise.resolve(null),
    db.customer.findFirst({ where: { id: input.customerId, businessId }, select: { id: true } }),
  ]);
  if (!customer) return { error: "Customer not found" } as const;

  const data: Prisma.BillUncheckedUpdateInput = {
    billNumber: input.billNumber,
    billType: input.billType,
    customerId: input.customerId,
    bankAccountId: bankAccount?.id ?? null,
    billDate: new Date(input.billDate),
    gstPercentage: input.billType === "GST" ? input.gstPercentage : null,
    buyerGstin: input.buyerGstin || null,
    notes: input.notes || null,
    showCustomerPhone: input.showCustomerPhone,
  };

  // Only the bank block of the frozen letterhead follows an edit — business
  // name/logo/etc. stay exactly as they were when the bill was generated.
  if ((bankAccount?.id ?? null) !== bill.bankAccountId) {
    const business = await db.business.findUniqueOrThrow({ where: { id: businessId } });
    const fresh = buildLetterhead(business, bankAccount);
    data.letterhead = { ...(bill.letterhead as object), bankAccount: fresh.bankAccount } as object;
  }

  let subtotal: number;
  let taxableValue: number;
  let totalAdjust = 0;
  let itemsWrite: Omit<Prisma.BillItemUncheckedCreateInput, "billId">[] | null = null;

  if (bill.isDirect) {
    if (!input.excavatorId || !input.fromDate || !input.toDate) {
      return { error: "Select a machine and the period" } as const;
    }
    const machine = await db.excavator.findFirst({ where: { id: input.excavatorId, businessId }, select: { id: true } });
    if (!machine) return { error: "Machine not found" } as const;
    subtotal = round2(round2(input.bucketHours * input.bucketRate) + round2(input.breakerHours * input.breakerRate));
    taxableValue = round2(subtotal + input.transportCharges);
    const dieselAdvance = round2(input.dieselLiters * input.dieselPricePerLiter);
    totalAdjust = -dieselAdvance;
    Object.assign(data, {
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
      transportCharges: input.transportCharges,
    });
  } else {
    if (!input.items || input.items.length === 0) return { error: "A bill needs at least one row" } as const;
    const machines = await db.excavator.findMany({
      where: { businessId, id: { in: input.items.map((i) => i.excavatorId) } },
      select: { id: true },
    });
    const machineIds = new Set(machines.map((m) => m.id));
    if (input.items.some((i) => !machineIds.has(i.excavatorId))) {
      return { error: "One of the selected machines was not found" } as const;
    }
    const existing = new Map(bill.items.map((i) => [i.id, i]));
    itemsWrite = input.items.map((i) => ({
      excavatorId: i.excavatorId,
      workSessionId: (i.id && existing.get(i.id)?.workSessionId) || null,
      siteName: i.siteName,
      attachment: i.attachment || null,
      fromDate: new Date(i.fromDate),
      toDate: new Date(i.toDate),
      hours: i.hours,
      ratePerHour: i.ratePerHour,
      amount: round2(i.hours * i.ratePerHour),
    }));
    subtotal = round2(itemsWrite.reduce((sum, i) => sum + i.amount, 0));
    taxableValue =
      subtotal +
      input.transportCharges +
      input.fuelCharges +
      input.extraCharges +
      input.bucketCharge +
      input.breakerCharge -
      input.discount;
    Object.assign(data, {
      transportCharges: input.transportCharges,
      fuelCharges: input.fuelCharges,
      extraCharges: input.extraCharges,
      bucketCharge: input.bucketCharge,
      breakerCharge: input.breakerCharge,
      discount: input.discount,
    });
  }

  const { taxTotal, cgst, sgst } = gstSplit(taxableValue, input.billType, input.gstPercentage);
  const totalAmount = round2(taxableValue + taxTotal + totalAdjust);
  Object.assign(data, {
    subtotal,
    cgst,
    sgst,
    igst: null,
    totalAmount,
    status: paymentStatus(bill.paidAmount, totalAmount),
  });

  try {
    await db.$transaction(async (tx) => {
      if (itemsWrite) {
        await tx.billItem.deleteMany({ where: { billId: bill.id } });
        await tx.billItem.createMany({ data: itemsWrite.map((i) => ({ ...i, billId: bill.id })) });
      }
      await tx.bill.update({ where: { id: bill.id }, data });
    });
  } catch {
    return { error: "That bill number is already used — pick a different one" } as const;
  }
  return { id: bill.id } as const;
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

  const limitError = await checkDailyBillLimit(businessId, business.maxBillsPerDay);
  if (limitError) return { error: limitError } as const;

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
  filters?: { customerId?: string; isDirect?: boolean; from?: string; to?: string },
) {
  const billDate: { gte?: Date; lte?: Date } = {};
  if (filters?.from) billDate.gte = new Date(filters.from);
  // Bound at end-of-day so a bill dated on the "to" day itself is included.
  if (filters?.to) billDate.lte = new Date(`${filters.to}T23:59:59.999`);

  return db.bill.findMany({
    where: {
      businessId,
      ...(filters?.customerId ? { customerId: filters.customerId } : {}),
      ...(filters?.isDirect !== undefined ? { isDirect: filters.isDirect } : {}),
      ...(Object.keys(billDate).length > 0 ? { billDate } : {}),
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
      attachment: item.attachment,
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

async function resyncPayments(tx: Prisma.TransactionClient, billId: string) {
  const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
  const agg = await tx.payment.aggregate({ where: { billId }, _sum: { amount: true } });
  const paidAmount = round2(agg._sum.amount ?? 0);
  await tx.bill.update({ where: { id: billId }, data: { paidAmount, status: paymentStatus(paidAmount, bill.totalAmount) } });
}

/** Admin corrects a recorded payment (amount/date/method/notes). */
export async function updatePayment(
  businessId: string,
  input: { billId: string; paymentId: string; amount: number; date: string; method?: string; notes?: string },
) {
  const payment = await db.payment.findFirst({ where: { id: input.paymentId, billId: input.billId, businessId } });
  if (!payment) return { error: "Payment not found" } as const;
  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { amount: input.amount, date: new Date(input.date), method: input.method || null, notes: input.notes || null },
    });
    await resyncPayments(tx, input.billId);
  });
  return { success: true } as const;
}

export async function deletePayment(businessId: string, billId: string, paymentId: string) {
  const payment = await db.payment.findFirst({ where: { id: paymentId, billId, businessId } });
  if (!payment) return { error: "Payment not found" } as const;
  await db.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: payment.id } });
    await resyncPayments(tx, billId);
  });
  return { success: true } as const;
}

/** Deletes a bill with its lines and payments. Work records it covered
 * become billable again (their bill lines go with it). */
export async function deleteBill(businessId: string, id: string) {
  const bill = await db.bill.findFirst({ where: { id, businessId }, select: { id: true } });
  if (!bill) return { error: "Bill not found" } as const;
  await db.bill.delete({ where: { id } });
  return { success: true } as const;
}
