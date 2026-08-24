import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import {
  getDashboardSummary,
  getMachineHoursDetail,
  getMonthlyHoursTrend,
  getMonthlyRevenueTrend,
  getPaymentCollectionStatus,
  getProfitOverview,
  getRecentActivity,
  getTopCustomersByRevenue,
} from "@/lib/services/dashboard";

const RECENT_ACTIVITY_LIMIT = 20;

/** Backs the client-rendered dashboard page used by the Android bundled
 * build — same 8-way parallel batch the server-rendered web page fetches
 * directly, just returned as one JSON response instead of embedded in HTML. */
export async function GET() {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const [summary, hoursTrend, revenueTrend, activity, machineHours, paymentCollection, profit, topCustomers] =
    await Promise.all([
      getDashboardSummary(businessId),
      getMonthlyHoursTrend(businessId),
      getMonthlyRevenueTrend(businessId),
      getRecentActivity(businessId, RECENT_ACTIVITY_LIMIT),
      getMachineHoursDetail(businessId),
      getPaymentCollectionStatus(businessId),
      getProfitOverview(businessId),
      getTopCustomersByRevenue(businessId),
    ]);

  return NextResponse.json({
    cards: summary.cards,
    alerts: summary.alerts,
    ownerName: summary.ownerName,
    hoursTrend,
    revenueTrend,
    activity,
    machineHours,
    paymentCollection,
    profit,
    topCustomers,
  });
}
