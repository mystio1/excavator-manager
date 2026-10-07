"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import type { getBillDetail, toBillPreviewData } from "@/lib/services/bills";
import { ApiError, apiFetch, swrFetcher } from "@/lib/api-client";
import type { Plain } from "@/lib/plain";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormAlert } from "@/components/bill/editor/form-parts";
import { BillPreview } from "@/components/bill/bill-preview";
import { fromPaise, toPaise } from "@/components/bill/money-preview";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { PrintButton } from "./print-button";
import { DownloadExcelButton } from "./download-excel-button";
import { PaymentSection } from "./payment-section";
import Loading from "../../loading";

type BillDetail = Plain<NonNullable<Awaited<ReturnType<typeof getBillDetail>>>>;
type PreviewData = ReturnType<typeof toBillPreviewData>;

export default function BillDetailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id") ?? "";
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data } = useSWR<{ bill: BillDetail; previewData: PreviewData }>(
    id ? `/api/bills/${id}` : null,
    swrFetcher,
  );

  async function onDelete(version: number) {
    if (!window.confirm("Delete this bill and its payments? This cannot be undone.")) return;
    setDeleteError(null);
    try {
      // The version this page was showing: a payment recorded or an edit made
      // elsewhere in the meantime is reported instead of deleted blindly.
      await apiFetch(`/api/bills/${id}?expectedVersion=${version}`, { method: "DELETE" });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the bill");
      if (err instanceof ApiError && err.code === "RESOURCE_MODIFIED") await mutate(`/api/bills/${id}`);
      return;
    }
    await mutate((k) => typeof k === "string" && (k.startsWith("/api/bills") || k.startsWith("/api/dashboard")));
    router.push("/bills");
  }

  if (!data) return <Loading />;
  const { bill, previewData } = data;
  // Whole paise, so the prefilled payment amount is always a valid 2-dp value.
  const pending = fromPaise(toPaise(bill.totalAmount) - toPaise(bill.paidAmount));

  return (
    <div>
      <PageHeader
        title={bill.billNumber}
        backHref="/bills"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="lg"
              className="h-11"
              nativeButton={false}
              render={<Link href={`/bills/edit?id=${bill.id}`} />}
            >
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="icon-lg"
              className="h-11 w-11 text-destructive"
              aria-label="Delete bill"
              onClick={() => onDelete(bill.version)}
            >
              <Trash2 className="size-4" />
            </Button>
            <DownloadExcelButton billId={bill.id} />
            <PrintButton />
          </div>
        }
      />
      <div className="flex flex-col gap-4 px-4 pb-6 md:px-8">
        {deleteError && <FormAlert className="print-hidden">{deleteError}</FormAlert>}
        {/* Three boxes side by side when there is room for a lakh-sized amount in
            each, otherwise one labelled row per figure. */}
        <div className="print-hidden @container">
          <dl className="grid grid-cols-1 gap-2 text-sm @min-[420px]:grid-cols-3 @min-[420px]:gap-3 @min-[420px]:text-center">
            <div className="flex items-baseline justify-between gap-3 rounded-lg border p-3 @min-[420px]:block">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-lg font-bold">{formatCurrency(bill.totalAmount)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-lg border p-3 @min-[420px]:block">
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="text-lg font-bold text-emerald-700 dark:text-working">{formatCurrency(bill.paidAmount)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-lg border p-3 @min-[420px]:block">
              <dt className="text-muted-foreground">Pending</dt>
              <dd className="text-lg font-bold text-red-700 dark:text-red-400">{formatCurrency(pending)}</dd>
            </div>
          </dl>
        </div>

        <Card className="overflow-hidden p-0">
          <CardContent className="p-0">
            <BillPreview bill={previewData} />
          </CardContent>
        </Card>

        <div className="print-hidden">
          <PaymentSection billId={bill.id} pending={pending} payments={bill.payments} />
        </div>

        <p className="print-hidden text-center text-xs text-muted-foreground">
          Bill generated {formatDate(bill.createdAt)}
        </p>
      </div>
    </div>
  );
}
