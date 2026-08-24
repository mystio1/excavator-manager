"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { getOperatorDetail } from "@/lib/services/operators";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { EditOperatorForm } from "./edit-operator-form";
import Loading from "../../../loading";

type OperatorDetail = NonNullable<Awaited<ReturnType<typeof getOperatorDetail>>>;

export default function EditOperatorPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";

  const { data } = useSWR<{ detail: OperatorDetail }>(id ? `/api/operators/detail?id=${id}` : null, swrFetcher);

  if (!data) return <Loading />;

  return (
    <div>
      <PageHeader title="Edit Operator" backHref={`/operators/detail?id=${id}`} />
      <div className="px-4 pb-6 md:px-8">
        <EditOperatorForm operator={data.detail.operator} />
      </div>
    </div>
  );
}
