import { db } from "@/lib/db";
import type { AddCustomerInput } from "@/lib/validation/customer";

export async function listCustomers(businessId: string, search?: string, tripDate?: string) {
  const customers = await db.customer.findMany({
    where: {
      businessId,
      isArchived: false,
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { companyName: { contains: search } },
              { mobile: { contains: search } },
            ],
          }
        : {}),
      ...(tripDate
        ? { workSessions: { some: { startDate: { gte: new Date(tripDate), lte: new Date(`${tripDate}T23:59:59.999`) } } } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      workSessions: { select: { id: true } },
      bills: { select: { totalAmount: true, paidAmount: true } },
    },
  });

  return customers.map((c) => {
    const totalRevenue = Math.round(c.bills.reduce((sum, b) => sum + b.totalAmount, 0) * 100) / 100;
    const pending = Math.round(c.bills.reduce((sum, b) => sum + (b.totalAmount - b.paidAmount), 0) * 100) / 100;
    return {
      id: c.id,
      name: c.name,
      companyName: c.companyName,
      mobile: c.mobile,
      tripCount: c.workSessions.length,
      totalRevenue,
      pending,
    };
  });
}

export async function createCustomer(businessId: string, input: AddCustomerInput) {
  return db.customer.create({
    data: {
      businessId,
      name: input.name,
      mobile: input.mobile,
      companyName: input.companyName || null,
      address: input.address || null,
      gstNumber: input.gstNumber || null,
    },
  });
}

export async function listCustomerOptions(businessId: string) {
  return db.customer.findMany({
    where: { businessId, isArchived: false },
    select: { id: true, name: true, companyName: true, gstNumber: true },
    orderBy: { name: "asc" },
  });
}

export async function updateCustomer(businessId: string, id: string, input: AddCustomerInput) {
  return db.customer.updateMany({
    where: { id, businessId },
    data: {
      name: input.name,
      mobile: input.mobile,
      companyName: input.companyName || null,
      address: input.address || null,
      gstNumber: input.gstNumber || null,
    },
  });
}

export async function archiveCustomer(businessId: string, id: string) {
  return db.customer.updateMany({ where: { id, businessId }, data: { isArchived: true } });
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
    include: { bills: { select: { totalAmount: true, paidAmount: true } } },
  });
  if (!customer) return null;

  const totalRevenue = Math.round(customer.bills.reduce((sum, b) => sum + b.totalAmount, 0) * 100) / 100;
  const pending = Math.round(customer.bills.reduce((sum, b) => sum + (b.totalAmount - b.paidAmount), 0) * 100) / 100;

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
  const totalHours = sessions.reduce((sum, s) => sum + s.totalHours, 0);
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
