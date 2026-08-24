import Link from "next/link";
import {
  Banknote,
  Clock,
  IndianRupee,
  LineChart,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { requireBusiness } from "@/lib/session";
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
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/currency";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { AlertBanner } from "@/components/dashboard/alert-banner";
import { MonthlyBarChart } from "@/components/dashboard/monthly-bar-chart";
import { HoursDetailButton } from "@/components/dashboard/hours-detail-button";
import { ProfitOverview } from "@/components/dashboard/profit-overview";
import { PaymentCollectionStatus } from "@/components/dashboard/payment-collection-status";
import { TopCustomers } from "@/components/dashboard/top-customers";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { SectionTitle } from "@/components/dashboard/section-title";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const RECENT_ACTIVITY_LIMIT = 20;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  // TEMPORARY: timing instrumentation to find the real production
  // bottleneck behind reported slow navigation — remove once diagnosed.
  // eslint-disable-next-line react-hooks/purity -- diagnostic only, value never reaches rendering
  const pageStart = performance.now();
  const { businessId } = await requireBusiness();
  // eslint-disable-next-line react-hooks/purity -- diagnostic only, value never reaches rendering
  const afterAuth = performance.now();
  const [
    { cards, alerts, ownerName },
    hoursTrend,
    revenueTrend,
    activity,
    machineHours,
    paymentCollection,
    profit,
    topCustomers,
  ] = await Promise.all([
    getDashboardSummary(businessId),
    getMonthlyHoursTrend(businessId),
    getMonthlyRevenueTrend(businessId),
    getRecentActivity(businessId, RECENT_ACTIVITY_LIMIT),
    getMachineHoursDetail(businessId),
    getPaymentCollectionStatus(businessId),
    getProfitOverview(businessId),
    getTopCustomersByRevenue(businessId),
  ]);
  // eslint-disable-next-line react-hooks/purity -- diagnostic only, value never reaches rendering
  const afterData = performance.now();
  console.log(
    `[perf] dashboard page: requireBusiness=${(afterAuth - pageStart).toFixed(0)}ms dataBatch=${(afterData - afterAuth).toFixed(0)}ms total=${(afterData - pageStart).toFixed(0)}ms`,
  );

  const firstName = ownerName.split(" ")[0];

  return (
    <div className="flex flex-col gap-6 px-4 py-5 md:px-8 md:py-8">
      {/* Greeting */}
      <div className="animate-fade-in-up">
        <h1 className="bg-gradient-to-r from-primary to-golden bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
          {greeting()}, {firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Here&rsquo;s what&rsquo;s happening with your excavator business today.
        </p>
      </div>

      <AlertBanner alerts={alerts} />

      {/* Critical KPIs */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
        <Link href="/customers" className="block">
          <SummaryCard icon={Users} label="Total Customers" value={cards.totalCustomers} accent="default" />
        </Link>
        <SummaryCard
          icon={IndianRupee}
          label="Monthly Revenue"
          value={formatCurrencyCompact(cards.revenueThisMonth)}
          exactValue={formatCurrency(cards.revenueThisMonth)}
          trendPct={cards.revenueTrendPct}
          accent="success"
        />
        <SummaryCard
          icon={Banknote}
          label="Amount Received"
          value={formatCurrencyCompact(cards.amountReceived)}
          exactValue={formatCurrency(cards.amountReceived)}
          accent="info"
        />
        <SummaryCard
          icon={Wallet}
          label="Total Amount"
          value={formatCurrencyCompact(cards.totalRevenueAllTime)}
          exactValue={formatCurrency(cards.totalRevenueAllTime)}
          accent="premium"
        />
        <SummaryCard
          icon={Clock}
          label="Hours This Month"
          value={cards.hoursThisMonth}
          trendPct={cards.hoursTrendPct}
          action={<HoursDetailButton machines={machineHours} />}
          accent="info"
        />
      </div>

      {/* Profit Overview + Payment Collection */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Card className="animate-fade-in-up">
          <CardHeader>
            <SectionTitle icon={LineChart} tone="premium">
              Business Profit Overview
            </SectionTitle>
          </CardHeader>
          <CardContent>
            <ProfitOverview {...profit} />
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up">
          <CardHeader>
            <SectionTitle icon={Wallet} tone="info">
              Payment Collection Status
            </SectionTitle>
          </CardHeader>
          <CardContent>
            <PaymentCollectionStatus {...paymentCollection} />
          </CardContent>
        </Card>
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <Card className="animate-fade-in-up">
          <CardHeader>
            <SectionTitle icon={IndianRupee} tone="success">
              Revenue — Last 6 Months
            </SectionTitle>
          </CardHeader>
          <CardContent>
            <MonthlyBarChart data={revenueTrend} dataKey="revenue" seriesLabel="Revenue" valueKind="currency" />
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up">
          <CardHeader>
            <SectionTitle icon={Clock} tone="info">
              Working Hours — Last 6 Months
            </SectionTitle>
          </CardHeader>
          <CardContent>
            <MonthlyBarChart data={hoursTrend} dataKey="hours" seriesLabel="Hours" valueKind="hours" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <RecentActivityCard events={activity} />
        <Card className="animate-fade-in-up">
          <CardHeader>
            <SectionTitle icon={Trophy} tone="success">
              Top Customers
            </SectionTitle>
          </CardHeader>
          <CardContent>
            {topCustomers.length > 0 ? (
              <TopCustomers customers={topCustomers} />
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No billed customers yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
