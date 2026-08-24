"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { getExcavatorDetail } from "@/lib/services/excavators";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { EditExcavatorForm } from "./edit-excavator-form";
import Loading from "../../../loading";

type ExcavatorDetail = NonNullable<Awaited<ReturnType<typeof getExcavatorDetail>>>;
type DetailData = { detail: ExcavatorDetail };
type BusinessSettings = { defaultServiceIntervalHrs: number };

export default function EditExcavatorPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";

  const { data } = useSWR<DetailData>(id ? `/api/excavators/${id}` : null, swrFetcher);
  const { data: settings } = useSWR<BusinessSettings>("/api/settings/service-interval", swrFetcher);

  if (!data || !settings) return <Loading />;

  return (
    <div>
      <PageHeader title="Edit Machine" backHref={`/excavators/detail?id=${id}`} />
      <div className="px-4 pb-6 md:px-8">
        <EditExcavatorForm excavator={data.detail.excavator} defaultServiceIntervalHrs={settings.defaultServiceIntervalHrs} />
      </div>
    </div>
  );
}
