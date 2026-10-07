import { requireBusinessApi } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { json, withApi } from "@/lib/with-api";

/** Just the one field the Edit Machine form needs as a placeholder — not
 * the full settings page, which has its own richer endpoint. */
export const GET = withApi("settings.service-interval", async () => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const business = await db.business.findUniqueOrThrow({
    where: { id: auth.session.businessId },
    select: { defaultServiceIntervalHrs: true },
  });
  return json(business);
});
