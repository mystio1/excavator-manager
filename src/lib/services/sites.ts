import { db } from "@/lib/db";

export async function listSiteOptions(businessId: string) {
  return db.site.findMany({
    where: { businessId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** SQLite string equality is case-sensitive (no `mode: "insensitive"` support
 * here, unlike Postgres), so a plain `findFirst` on the raw name lets
 * "Kharadi" and "kharadi" become two different Site rows. Every site
 * find-or-create in the app must go through this instead of querying
 * db.site directly, so a site is only ever created once regardless of how
 * its name was capitalized when typed. */
export async function findOrCreateSite(businessId: string, rawName: string) {
  const name = rawName.trim();
  const existing = await db.site.findMany({ where: { businessId } });
  const match = existing.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
  if (match) return match;
  return db.site.create({ data: { businessId, name } });
}
