import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { listPendingLogs } from "@/lib/services/workSessions";
import { listPendingWorkRequests } from "@/lib/services/operatorWorkRequests";
import { listCustomerOptions } from "@/lib/services/customers";

export async function GET() {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const [logs, workRequests, customers] = await Promise.all([
    listPendingLogs(businessId),
    listPendingWorkRequests(businessId),
    listCustomerOptions(businessId),
  ]);

  return NextResponse.json({ logs, workRequests, customers });
}
