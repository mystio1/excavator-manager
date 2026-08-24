"use client";

import useSWR from "swr";
import { MapPin } from "lucide-react";
import type { listSiteAnalysisReadings } from "@/lib/services/operatorWorkRequests";
import type { listSiteOptions } from "@/lib/services/sites";
import type { listCustomerOptions } from "@/lib/services/customers";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SiteAnalysisExplorer } from "./site-analysis-explorer";
import Loading from "../loading";

type SiteAnalysisData = {
  readings: Awaited<ReturnType<typeof listSiteAnalysisReadings>>;
  siteOptions: Awaited<ReturnType<typeof listSiteOptions>>;
  customerOptions: Awaited<ReturnType<typeof listCustomerOptions>>;
};

export default function SiteAnalysisPage() {
  const { data } = useSWR<SiteAnalysisData>("/api/site-analysis", swrFetcher, { dedupingInterval: 15_000 });

  if (!data) return <Loading />;
  const { readings, siteOptions, customerOptions } = data;

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
