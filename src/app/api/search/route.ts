import { z } from "zod";
import { requireBusinessApi } from "@/lib/api-auth";
import { parsePagination } from "@/lib/pagination";
import { SEARCH_GROUPS, globalSearch } from "@/lib/services/search";
import { json, withApi } from "@/lib/with-api";

const searchQuerySchema = z.object({
  q: z.string().trim().max(100, "Search text is too long (100 characters max)"),
  type: z.enum(SEARCH_GROUPS, "type must be excavators, customers, operators or bills").optional(),
});

/** `?q=` → the first 8 hits per group plus `results.nextCursors` (a non-null
 * cursor = that group has more). To load more of ONE group:
 * `?q=…&type=customers&limit=20&cursor=<that group's cursor>` — the response
 * then carries `nextCursor` for that group. */
export const GET = withApi("search.get", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const params = new URL(req.url).searchParams;
  const { q, type } = searchQuerySchema.parse({
    q: params.get("q") ?? "",
    type: params.get("type") || undefined,
  });

  const results = await globalSearch(auth.session.businessId, q, type ? { group: type, page: parsePagination(req) } : undefined);
  return json({ results, nextCursor: type ? results.nextCursors[type] : null });
});
