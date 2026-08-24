"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { getCustomerDetail } from "@/lib/services/customers";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { EditCustomerForm } from "./edit-customer-form";
import Loading from "../../../loading";

type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomerDetail>>>;

export default function EditCustomerPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";

  const { data } = useSWR<{ detail: CustomerDetail }>(id ? `/api/customers/detail?id=${id}` : null, swrFetcher);

  if (!data) return <Loading />;

  return (
    <div>
      <PageHeader title="Edit Customer" backHref={`/customers/detail?id=${id}`} />
      <div className="px-4 pb-6 md:px-8">
        <EditCustomerForm customer={data.detail.customer} />
      </div>
    </div>
  );
}
