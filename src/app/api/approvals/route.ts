import { requireBusinessApi } from "@/lib/api-auth";
import { listPendingLogs } from "@/lib/services/workSessions";
import { listPendingWorkRequests } from "@/lib/services/operatorWorkRequests";
import { listCustomerOptions } from "@/lib/services/customers";
import { listPendingJoinRequests } from "@/lib/services/operators";
import { json, withApi } from "@/lib/with-api";

export const GET = withApi("approvals.list", async () => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const [logs, workRequests, customers, joinRequests] = await Promise.all([
    listPendingLogs(businessId),
    listPendingWorkRequests(businessId),
    listCustomerOptions(businessId),
    listPendingJoinRequests(businessId),
  ]);

  return json({ logs, workRequests, customers, joinRequests });
});
