"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { AddExcavatorForm } from "./add-excavator-form";
import Loading from "../../loading";

export default function NewExcavatorPage() {
  const { data } = useSWR<{ defaultServiceIntervalHrs: number }>("/api/settings/service-interval", swrFetcher);

  if (!data) return <Loading />;

  return (
    <div>
      <PageHeader title="Add Machine" backHref="/excavators" />
      <div className="px-4 pb-6 md:px-8">
        <AddExcavatorForm defaultServiceIntervalHrs={data.defaultServiceIntervalHrs} />
      </div>
    </div>
  );
}
