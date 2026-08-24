import { requireBusiness } from "@/lib/session";
import { listSiteAnalysisReadings } from "@/lib/services/operatorWorkRequests";
import { listSiteOptions } from "@/lib/services/sites";
import { listCustomerOptions } from "@/lib/services/customers";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { MapPin } from "lucide-react";
import { SiteAnalysisExplorer } from "./site-analysis-explorer";

export default async function SiteAnalysisPage() {
  const { businessId } = await requireBusiness();
  const [readings, siteOptions, customerOptions] = await Promise.all([
    listSiteAnalysisReadings(businessId),
    listSiteOptions(businessId),
    listCustomerOptions(businessId),
  ]);

  return (
    <div>
      <PageHeader title="Site Analysis" />
      <div className="flex flex-col gap-3 px-4 pb-6 md:px-8">
        {readings.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No Completed Work Yet"
            description="Once jobs are approved, pick a site or customer here to see machine usage and diesel averages."
          />
        ) : (
          <SiteAnalysisExplorer readings={readings} siteOptions={siteOptions} customerOptions={customerOptions} />
        )}
      </div>
    </div>
  );
}
