import { ApiHttpError } from "@/lib/api-error";

/**
 * Cursor pagination for list endpoints.
 *
 *   GET /api/bills?limit=50&cursor=<opaque>
 *   → { bills: [...], nextCursor: "<opaque>" | null }
 *
 * - Ordering MUST be stable: always include a unique tie-breaker (id) last,
 *   e.g. orderBy: [{ billDate: "desc" }, { id: "desc" }].
 * - The cursor is the last item's id (opaque to clients); services pass it to
 *   Prisma as `cursor: { id }, skip: 1`.
 * - Backward compatibility: installed Android apps do not send `limit`. When it
 *   is absent we apply LEGACY_LIMIT (a generous, bounded page) instead of
 *   returning an unbounded list. New clients send an explicit `limit`
 *   (DEFAULT_LIMIT) and a "Load more" control.
 */

export const DEFAULT_LIMIT = 50;
export const LEGACY_LIMIT = 200;
export const MAX_LIMIT = 200;

export type PageParams = { limit: number; cursor: string | undefined };

export function parsePagination(req: Request): PageParams {
  const params = new URL(req.url).searchParams;
  const rawLimit = params.get("limit");
  let limit = LEGACY_LIMIT;
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < 1) throw new ApiHttpError("BAD_REQUEST", "limit must be a positive integer");
    limit = Math.min(n, MAX_LIMIT);
  }
  const cursor = params.get("cursor") || undefined;
  if (cursor && cursor.length > 128) throw new ApiHttpError("BAD_REQUEST", "Invalid cursor");
  return { limit, cursor };
}

/** Prisma args for a page: fetch one extra row to learn whether there is more. */
export function pageArgs({ limit, cursor }: PageParams) {
  return {
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

/** Trims the extra row and derives nextCursor. */
export function toPage<T extends { id: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}
