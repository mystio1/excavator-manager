"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import type { getBillDetail, toBillPreviewData } from "@/lib/services/bills";
import { apiFetch, swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BillPreview } from "@/components/bill/bill-preview";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { PrintButton } from "./print-button";
import { DownloadExcelButton } from "./download-excel-button";
import { PaymentSection } from "./payment-section";
import Loading from "../../loading";

type BillDetail = NonNullable<Awaited<ReturnType<typeof getBillDetail>>>;
type PreviewData = ReturnType<typeof toBillPreviewData>;

export default function BillDetailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id") ?? "";

  const { data } = useSWR<{ bill: BillDetail; previewData: PreviewData }>(
    id ? `/api/bills/${id}` : null,
    swrFetcher,
  );

  async function onDelete() {
    if (!window.confirm("Delete this bill and its payments? This cannot be undone.")) return;
    await apiFetch(`/api/bills/${id}`, { method: "DELETE" });
    await mutate((k) => typeof k === "string" && (k.startsWith("/api/bills") || k.startsWith("/api/dashboard")));
    router.push("/bills");
  }

  if (!data) return <Loading />;
  const { bill, previewData } = data;
  const pending = bill.totalAmount - bill.paidAmount;

  return (
    <div>
      <PageHeader
        title={bill.billNumber}
        backHref="/bills"
        action={
          <div className="flex shrink-0 gap-2">
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
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
            <DownloadExcelButton billId={bill.id} />
            <PrintButton />
          </div>
        }
      />
      <div className="flex flex-col gap-4 px-4 pb-6 md:px-8">
        <div className="print-hidden grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground">Total</p>
            <p className="text-lg font-bold">{formatCurrency(bill.totalAmount)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground">Paid</p>
            <p className="text-lg font-bold text-working">{formatCurrency(bill.paidAmount)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground">Pending</p>
            <p className="text-lg font-bold text-destructive">{formatCurrency(pending)}</p>
          </div>
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
