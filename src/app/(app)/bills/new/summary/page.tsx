"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { BillEditorForm, type BillFormOptions } from "@/components/bill/bill-editor-form";
import Loading from "../../../loading";

export default function NewSummaryBillPage() {
  const { data } = useSWR<BillFormOptions>("/api/bills/new/summary", swrFetcher);

  if (!data) return <Loading />;

  return (
    <div>
      <PageHeader title="Summary Bill" backHref="/bills" />
      <div className="px-4 pb-6 md:px-8">
        <BillEditorForm options={data} mode="create" />
      </div>
    </div>
  );
}
