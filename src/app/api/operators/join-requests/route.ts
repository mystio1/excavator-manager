import { requireBusinessApi } from "@/lib/api-auth";
import { listPendingJoinRequests } from "@/lib/services/operators";
import { json, withApi } from "@/lib/with-api";

/** Pending, unexpired join requests (never any hash). At most 50 per business
 * by construction, so this is bounded without paging. */
export const GET = withApi("operators.joinRequests.list", async () => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const joinRequests = await listPendingJoinRequests(auth.session.businessId);
  return json({ joinRequests });
});
