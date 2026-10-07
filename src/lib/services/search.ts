import { db } from "@/lib/db";
import { pageArgs, toPage, type PageParams } from "@/lib/pagination";

export const SEARCH_GROUPS = ["excavators", "customers", "operators", "bills"] as const;
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

/** How many hits each group shows in the combined (all-groups) search. */
export const SEARCH_PREVIEW_LIMIT = 8;

export type SearchNextCursors = Record<SearchGroup, string | null>;

const noCursors = (): SearchNextCursors => ({ excavators: null, customers: null, operators: null, bills: null });

// Each group is ordered stably (a sort key + id as the tie-breaker) so a
// cursor always continues exactly where the previous page stopped. Matching is
// case-insensitive.
const searchers = {
  excavators: async (businessId: string, q: string, page: PageParams) => {
    const rows = await db.excavator.findMany({
      where: {
        businessId,
        isArchived: false,
        OR: [{ name: { contains: q, mode: "insensitive" } }, { machineNumber: { contains: q, mode: "insensitive" } }],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      ...pageArgs(page),
      select: { id: true, name: true, machineNumber: true, status: true },
    });
    return toPage(rows, page.limit);
  },
  customers: async (businessId: string, q: string, page: PageParams) => {
    const rows = await db.customer.findMany({
      where: {
        businessId,
        isArchived: false,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { companyName: { contains: q, mode: "insensitive" } },
          { mobile: { contains: q } },
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      ...pageArgs(page),
      select: { id: true, name: true, companyName: true, mobile: true },
    });
    return toPage(rows, page.limit);
  },
  operators: async (businessId: string, q: string, page: PageParams) => {
    const rows = await db.operator.findMany({
      where: {
        businessId,
        isArchived: false,
        OR: [{ name: { contains: q, mode: "insensitive" } }, { mobile: { contains: q } }],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      ...pageArgs(page),
      select: { id: true, name: true, mobile: true },
    });
    return toPage(rows, page.limit);
  },
  bills: async (businessId: string, q: string, page: PageParams) => {
    const rows = await db.bill.findMany({
      where: { businessId, billNumber: { contains: q, mode: "insensitive" } },
      orderBy: [{ billDate: "desc" }, { id: "desc" }],
      ...pageArgs(page),
      select: { id: true, billNumber: true, totalAmount: true, status: true, customer: { select: { name: true } } },
    });
    return toPage(rows, page.limit);
  },
};

type Page<T> = { items: T[]; nextCursor: string | null };

/** Runs one group's search, or returns an empty page when that group was not asked for. */
async function maybe<T extends { id: string }>(enabled: boolean, run: () => Promise<Page<T>>): Promise<Page<T>> {
  return enabled ? run() : { items: [], nextCursor: null };
}

/**
 * Global search across machines, customers, operators and bills.
 *
 * Without options it returns the first SEARCH_PREVIEW_LIMIT hits per group (the
 * shape every client has always read) plus `nextCursors`: a non-null cursor for
 * a group means it has more hits. To page one group, pass `group` and `page`
 * (limit/cursor): only that group is queried; the other groups come back empty.
 */
export async function globalSearch(
  businessId: string,
  query: string,
  opts?: { group?: SearchGroup; page?: PageParams },
) {
  const q = query.trim();
  if (!q) {
    return { excavators: [], customers: [], operators: [], bills: [], nextCursors: noCursors() };
  }

  const only = opts?.group;
  const page: PageParams = only
    ? (opts?.page ?? { limit: SEARCH_PREVIEW_LIMIT, cursor: undefined })
    : { limit: SEARCH_PREVIEW_LIMIT, cursor: undefined };

  const [excavators, customers, operators, bills] = await Promise.all([
    maybe(!only || only === "excavators", () => searchers.excavators(businessId, q, page)),
    maybe(!only || only === "customers", () => searchers.customers(businessId, q, page)),
    maybe(!only || only === "operators", () => searchers.operators(businessId, q, page)),
    maybe(!only || only === "bills", () => searchers.bills(businessId, q, page)),
  ]);

  return {
    excavators: excavators.items,
    customers: customers.items,
    operators: operators.items,
    bills: bills.items,
    nextCursors: {
      excavators: excavators.nextCursor,
      customers: customers.nextCursor,
      operators: operators.nextCursor,
      bills: bills.nextCursor,
    },
  };
}
