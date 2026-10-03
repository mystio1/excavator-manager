"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { getBillDetail } from "@/lib/services/bills";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { BillEditorForm, type BillFormInitial, type BillFormOptions } from "@/components/bill/bill-editor-form";
import Loading from "../../loading";

type BillDetail = NonNullable<Awaited<ReturnType<typeof getBillDetail>>>;

const day = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default function EditBillPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";

  const { data: options } = useSWR<BillFormOptions>("/api/bills/new/summary", swrFetcher);
  const { data: detail } = useSWR<{ bill: BillDetail }>(id ? `/api/bills/${id}` : null, swrFetcher);

  if (!options || !detail) return <Loading />;
  const { bill } = detail;

  const initial: BillFormInitial = {
    customerId: bill.customerId,
    billDate: day(bill.billDate),
    billNumber: bill.billNumber,
    billType: bill.billType === "GST" ? "GST" : "NON_GST",
    gstPercentage: bill.gstPercentage,
    buyerGstin: bill.buyerGstin ?? "",
    bankAccountId: bill.bankAccountId ?? "",
    notes: bill.notes ?? "",
    showCustomerPhone: bill.showCustomerPhone,
    transportCharges: bill.transportCharges,
    fuelCharges: bill.fuelCharges,
    extraCharges: bill.extraCharges,
    bucketCharge: bill.bucketCharge,
    breakerCharge: bill.breakerCharge,
    discount: bill.discount,
    items: bill.items.map((i) => ({
      id: i.id,
      attachment: i.attachment ?? "",
      excavatorId: i.excavatorId,
      siteName: i.siteName,
      fromDate: day(i.fromDate),
      toDate: day(i.toDate),
      hours: i.hours,
      ratePerHour: i.ratePerHour,
    })),
    excavatorId: bill.excavatorId ?? "",
    fromDate: day(bill.fromDate),
    toDate: day(bill.toDate),
    bucketHours: bill.bucketHours ?? 0,
    bucketRate: bill.bucketRate ?? 0,
    breakerHours: bill.breakerHours ?? 0,
    breakerRate: bill.breakerRate ?? 0,
    dieselLiters: bill.dieselLiters ?? 0,
    dieselPricePerLiter: bill.dieselPricePerLiter ?? 0,
  };

  return (
    <div>
      <PageHeader title={`Edit ${bill.billNumber}`} backHref={`/bills/detail?id=${bill.id}`} />
      <div className="px-4 pb-6 md:px-8">
        <BillEditorForm options={options} mode="edit" billId={bill.id} isDirect={bill.isDirect} initial={initial} />
      </div>
    </div>
  );
}
