import { requireBusinessApi } from "@/lib/api-auth";
import {
  dashboardRangeFromDays,
  getDashboardSummary,
  getMachineHoursDetail,
  getMonthlyHoursTrend,
  getMonthlyRevenueTrend,
  getPaymentCollectionStatus,
  getProfitOverview,
  getRecentActivity,
  getTopCustomersByRevenue,
} from "@/lib/services/dashboard";
import { json, withApi } from "@/lib/with-api";
import { dashboardQuerySchema } from "@/lib/validation/dashboard";

const RECENT_ACTIVITY_LIMIT = 20;

/** Backs the client-rendered dashboard page used by the Android bundled
 * build — same 8-way parallel batch the server-rendered web page fetches
 * directly, just returned as one JSON response instead of embedded in HTML.
 * Every total is summed exactly (Decimal) and sent as a plain number. */
export const GET = withApi("dashboard.get", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;
  // The date filter: `?from=yyyy-MM-dd&to=yyyy-MM-dd`. Without it every figure is for the
  // current month, as before (older Android builds never send it).
  const query = dashboardQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const range = query.from && query.to ? dashboardRangeFromDays(query.from, query.to) : undefined;

  const [summary, hoursTrend, revenueTrend, activity, machineHours, paymentCollection, profit, topCustomers] =
    await Promise.all([
      getDashboardSummary(businessId, range),
      getMonthlyHoursTrend(businessId),
      getMonthlyRevenueTrend(businessId),
      getRecentActivity(businessId, RECENT_ACTIVITY_LIMIT),
      getMachineHoursDetail(businessId, range),
      getPaymentCollectionStatus(businessId, range),
      getProfitOverview(businessId, range),
      getTopCustomersByRevenue(businessId, 5, range),
    ]);

  return json({
    cards: summary.cards,
    alerts: summary.alerts,
    ownerName: summary.ownerName,
    siteTotals: summary.siteTotals,
    hoursTrend,
    revenueTrend,
    activity,
    machineHours,
    paymentCollection,
    profit,
    topCustomers,
  });
});
