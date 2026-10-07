import { requireOperatorApi } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { json, withApi } from "@/lib/with-api";

/** Backs the client-rendered (operator)/layout.tsx used by the Android
 * bundled build — same data the server-rendered operator layout fetches
 * directly. allowFrozen: true for the same reason as /api/layout — this is
 * how a frozen business's operator client learns it's frozen at all. */
export const GET = withApi("operator.layout", async () => {
  const auth = await requireOperatorApi({ allowFrozen: true });
  if (auth.error) return auth.error;

  const operator = await db.operator.findFirstOrThrow({
    where: { id: auth.session.operatorId, businessId: auth.session.businessId },
    select: { name: true },
  });

  return json({ operatorName: operator.name, frozen: auth.session.businessFrozen });
});
