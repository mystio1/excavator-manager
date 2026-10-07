import { db } from "@/lib/db";
import type { Tx } from "@/lib/tx";

export async function listSiteOptions(businessId: string) {
  return db.site.findMany({
    where: { businessId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Site names are matched case-insensitively and ignoring surrounding spaces
 * (a plain equality lookup would let "Kharadi" and "kharadi" become two Site
 * rows; Prisma's `insensitive` mode is avoided on purpose because it is an
 * ILIKE, which would treat "%" / "_" typed in a name as wildcards). Every site
 * find-or-create in the app must go through this instead of querying db.site
 * directly, so a site is only ever created once regardless of how its name was
 * capitalized when typed.
 *
 * Pass `tx` to run inside the caller's transaction, so a site created for a
 * job that then fails to save does not linger. */
export async function findOrCreateSite(businessId: string, rawName: string, tx?: Tx) {
  const client = tx ?? db;
  const name = rawName.trim();
  const existing = await client.site.findMany({ where: { businessId } });
  const match = existing.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
  if (match) return match;
  return client.site.create({ data: { businessId, name } });
}
