import { db } from "@/lib/db";

export async function globalSearch(businessId: string, query: string) {
  const q = query.trim();
  if (!q) {
    return { excavators: [], customers: [], operators: [], bills: [] };
  }

  const [excavators, customers, operators, bills] = await Promise.all([
    db.excavator.findMany({
      where: {
        businessId,
        isArchived: false,
        OR: [{ name: { contains: q } }, { machineNumber: { contains: q } }],
      },
      take: 8,
      select: { id: true, name: true, machineNumber: true, status: true },
    }),
    db.customer.findMany({
      where: {
        businessId,
        isArchived: false,
        OR: [{ name: { contains: q } }, { companyName: { contains: q } }, { mobile: { contains: q } }],
      },
      take: 8,
      select: { id: true, name: true, companyName: true, mobile: true },
    }),
    db.operator.findMany({
      where: { businessId, isArchived: false, OR: [{ name: { contains: q } }, { mobile: { contains: q } }] },
      take: 8,
      select: { id: true, name: true, mobile: true },
    }),
    db.bill.findMany({
      where: { businessId, billNumber: { contains: q } },
      take: 8,
      select: { id: true, billNumber: true, totalAmount: true, status: true, customer: { select: { name: true } } },
    }),
  ]);

  return { excavators, customers, operators, bills };
}
