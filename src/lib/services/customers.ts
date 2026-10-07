import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fail } from "@/lib/api-error";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { dec, round2, sum } from "@/lib/money";
import { LEGACY_LIMIT, pageArgs, toPage, type PageParams } from "@/lib/pagination";
import { isStale, resourceModified, withTx, type Tx } from "@/lib/tx";
import type { AddCustomerInput } from "@/lib/validation/customer";

/** Same trip-date window the list always used: the day's UTC midnight up to the
 * last millisecond of that (server-local) day. */
function customerListWhere(businessId: string, search?: string, tripDate?: string): Prisma.CustomerWhereInput {
  return {
    businessId,
    isArchived: false,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { companyName: { contains: search, mode: "insensitive" } },
            { mobile: { contains: search } },
          ],
        }
      : {}),
    ...(tripDate
      ? { workSessions: { some: { startDate: { gte: new Date(tripDate), lte: new Date(`${tripDate}T23:59:59.999`) } } } }
      : {}),
  };
}

export type CustomerListSummary = {
  totalCustomers: number;
  withPendingDues: number;
  totalRevenue: number;
  pendingPayments: number;
};

/**
 * One page of the customers list, name A-Z (id as the tie-breaker so paging is
 * stable). Each row carries its exact billed / pending totals.
 *
 * `summary` covers the WHOLE filtered list (not just this page) so the cards
 * above the list stay correct while the list itself loads 50 at a time; it is
 * only computed for the first page (no cursor) and is null for later pages.
 * Callers that pass no page get the bounded legacy page (LEGACY_LIMIT) — older
 * Android builds never send `limit`.
 */
export async function listCustomers(
  businessId: string,
  search?: string,
  tripDate?: string,
  page: PageParams = { limit: LEGACY_LIMIT, cursor: undefined },
) {
  const where = customerListWhere(businessId, search, tripDate);

  const rows = await db.customer.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageArgs(page),
    select: {
      id: true,
      name: true,
      companyName: true,
      mobile: true,
      _count: { select: { workSessions: { where: { businessId } } } },
    },
  });
  const { items, nextCursor } = toPage(rows, page.limit);

  const [pageTotals, summary] = await Promise.all([
    items.length === 0
      ? Promise.resolve([])
      : db.bill.groupBy({
          by: ["customerId"],
          where: { businessId, customerId: { in: items.map((c) => c.id) } },
          _sum: { totalAmount: true, paidAmount: true },
        }),
    page.cursor ? Promise.resolve(null) : getCustomerListSummary(businessId, where),
  ]);
  const totalsByCustomer = new Map(pageTotals.map((t) => [t.customerId, t._sum]));

  const customers = items.map((c) => {
    const totals = totalsByCustomer.get(c.id);
    const billed = dec(totals?.totalAmount);
    return {
      id: c.id,
      name: c.name,
      companyName: c.companyName,
      mobile: c.mobile,
      tripCount: c._count.workSessions,
      totalRevenue: round2(billed).toNumber(),
      pending: round2(billed.minus(dec(totals?.paidAmount))).toNumber(),
    };
  });

  return { customers, nextCursor, summary };
}

/** Exact totals across every customer matching `where` (billed, still owed,
 * how many owe more than a paisa-rounding error). */
async function getCustomerListSummary(
  businessId: string,
  where: Prisma.CustomerWhereInput,
): Promise<CustomerListSummary> {
  const [totalCustomers, perCustomer] = await Promise.all([
    db.customer.count({ where }),
    db.bill.groupBy({
      by: ["customerId"],
      where: { businessId, customer: where },
      _sum: { totalAmount: true, paidAmount: true },
    }),
  ]);

  const billed = sum(perCustomer.map((c) => c._sum.totalAmount));
  const paid = sum(perCustomer.map((c) => c._sum.paidAmount));
  const withPendingDues = perCustomer.filter(
    (c) => round2(dec(c._sum.totalAmount).minus(dec(c._sum.paidAmount))).toNumber() > 0.01,
  ).length;

  return {
    totalCustomers,
    withPendingDues,
    totalRevenue: round2(billed).toNumber(),
    pendingPayments: round2(billed.minus(paid)).toNumber(),
  };
}

export async function createCustomer(
  businessId: string,
  actor: AuditActor,
  input: AddCustomerInput,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    const customer = await tx.customer.create({
      data: {
        businessId,
        name: input.name,
        mobile: input.mobile,
        companyName: input.companyName || null,
        address: input.address || null,
        gstNumber: input.gstNumber || null,
      },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "customer.create",
      entityType: "Customer",
      entityId: customer.id,
      after: customer,
    });
    return customer;
  });
}

/** Dropdown source for every "pick a customer" control (new bill, start work,
 * site analysis, approvals…). It stays a COMPLETE, unpaginated list so those
 * controls keep working unchanged — but bounded: at most CUSTOMER_OPTIONS_MAX
 * rows, name A-Z, so a runaway tenant can never make this endpoint unbounded.
 * The /api/customers/options route reports `truncated` when the cap was hit. */
export const CUSTOMER_OPTIONS_MAX = 1000;

export async function listCustomerOptions(businessId: string) {
  return db.customer.findMany({
    where: { businessId, isArchived: false },
    select: { id: true, name: true, companyName: true, gstNumber: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: CUSTOMER_OPTIONS_MAX,
  });
}

/** Row lock so two concurrent edits of one customer serialize (the second one
 * then sees the first one's new `version`). Scoped by business. */
async function lockCustomer(tx: Tx, businessId: string, id: string) {
  await tx.$queryRaw`SELECT 1 FROM "Customer" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR NO KEY UPDATE`;
}

/**
 * Edits a customer. `expectedVersion` (optimistic concurrency) is the version
 * the client loaded; if the row has moved on the edit is refused with
 * RESOURCE_MODIFIED instead of silently overwriting the other change. Omitted
 * (older apps) = no check. Every successful write bumps `version`.
 */
export async function updateCustomer(
  businessId: string,
  actor: AuditActor,
  id: string,
  input: AddCustomerInput,
  opts?: { expectedVersion?: number | null; tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    await lockCustomer(tx, businessId, id);
    const before = await tx.customer.findFirst({ where: { id, businessId } });
    if (!before) return fail("NOT_FOUND", "Customer not found");
    if (isStale(before.version, opts?.expectedVersion)) return resourceModified("customer");

    const customer = await tx.customer.update({
      where: { id, businessId },
      data: {
        name: input.name,
        mobile: input.mobile,
        companyName: input.companyName || null,
        address: input.address || null,
        gstNumber: input.gstNumber || null,
        version: { increment: 1 },
      },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "customer.update",
      entityType: "Customer",
      entityId: id,
      before,
      after: customer,
    });
    return { customer } as const;
  });
}

/** Hides a customer from the active list (history and bills are kept).
 * Archiving an already-archived customer is a no-op success. */
export async function archiveCustomer(
  businessId: string,
  actor: AuditActor,
  id: string,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    await lockCustomer(tx, businessId, id);
    const before = await tx.customer.findFirst({ where: { id, businessId } });
    if (!before) return fail("NOT_FOUND", "Customer not found");
    if (before.isArchived) return { customer: before } as const;

    const customer = await tx.customer.update({
      where: { id, businessId },
      data: { isArchived: true, version: { increment: 1 } },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "customer.archive",
      entityType: "Customer",
      entityId: id,
      before,
      after: customer,
    });
    return { customer } as const;
  });
}

export type CustomerHistoryFilters = {
  excavatorId?: string;
  siteName?: string;
  from?: string;
  to?: string;
};

export async function getCustomerDetail(businessId: string, id: string, filters: CustomerHistoryFilters = {}) {
  const customer = await db.customer.findFirst({
    where: { id, businessId },
    include: { bills: { where: { businessId }, select: { totalAmount: true, paidAmount: true } } },
  });
  if (!customer) return null;

  const billed = sum(customer.bills.map((b) => b.totalAmount));
  const paid = sum(customer.bills.map((b) => b.paidAmount));
  const totalRevenue = round2(billed).toNumber();
  const pending = round2(billed.minus(paid)).toNumber();

  const sessions = await db.workSession.findMany({
    where: { customerId: id, businessId },
    orderBy: { startDate: "desc" },
    include: {
      excavator: { select: { id: true, name: true, machineNumber: true } },
      site: { select: { name: true } },
      operator: { select: { name: true } },
      dailyLogs: { select: { date: true } },
    },
  });

  // Summary cards and the filter dropdowns always reflect the customer's
  // FULL history — only the list below them narrows with the filters.
  const machineIds = new Set(sessions.map((s) => s.excavatorId));
  const totalHours = Math.round(sessions.reduce((acc, s) => acc + s.totalHours, 0) * 100) / 100;
  const workingDays = new Set(
    sessions.flatMap((s) => s.dailyLogs.map((log) => log.date.toDateString())),
  ).size;
  const machineOptions = [
    ...new Map(
      sessions.map((s) => [s.excavator.id, { id: s.excavator.id, name: s.excavator.name, machineNumber: s.excavator.machineNumber }]),
    ).values(),
  ];
  const siteOptions = [...new Set(sessions.map((s) => s.site.name))].sort();

  const filtered = sessions.filter((s) => {
    if (filters.excavatorId && s.excavatorId !== filters.excavatorId) return false;
    if (filters.siteName && s.site.name !== filters.siteName) return false;
    if (filters.from && s.startDate < new Date(filters.from)) return false;
    if (filters.to && s.startDate > new Date(`${filters.to}T23:59:59.999`)) return false;
    return true;
  });

  return {
    customer,
    totalMachinesUsed: machineIds.size,
    totalWorkingDays: workingDays,
    totalHours,
    totalRevenue,
    pending,
    machineOptions,
    siteOptions,
    machineHistory: filtered.map((s) => ({
      id: s.id,
      excavatorName: s.excavator.name,
      machineNumber: s.excavator.machineNumber,
      siteName: s.site.name,
      operatorName: s.operator.name,
      startDate: s.startDate,
      endDate: s.endDate,
      totalHours: s.totalHours,
      status: s.status,
    })),
  };
}
