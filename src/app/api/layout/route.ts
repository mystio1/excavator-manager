import { requireBusinessApi } from "@/lib/api-auth";
import { getAlerts } from "@/lib/services/dashboard";
import { db } from "@/lib/db";
import { json, withApi } from "@/lib/with-api";

/** Backs the client-rendered (app)/layout.tsx used by the Android bundled
 * build — same data the server-rendered web layout fetches directly.
 * allowFrozen: true because this is how a frozen business's own client
 * learns it's frozen at all — see (app)/layout.tsx's full-screen notice. */
export const GET = withApi("layout.get", async () => {
  const auth = await requireBusinessApi({ allowFrozen: true });
  if (auth.error) return auth.error;
  const { businessName, ownerName, businessId, businessFrozen, userId } = auth.session;

  const [alerts, user] = await Promise.all([
    businessFrozen ? Promise.resolve([]) : getAlerts(businessId),
    db.user.findFirst({ where: { id: userId, businessId }, select: { appPinHash: true } }),
  ]);

  return json({ businessName, ownerName, alerts, frozen: businessFrozen, hasPin: !!user?.appPinHash });
});
