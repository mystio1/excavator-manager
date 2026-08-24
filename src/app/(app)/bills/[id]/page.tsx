import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/session";
import { getBillDetail, toBillPreviewData } from "@/lib/services/bills";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { BillPreview } from "@/components/bill/bill-preview";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { PrintButton } from "./print-button";
import { DownloadExcelButton } from "./download-excel-button";
import { PaymentSection } from "./payment-section";

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { businessId } = await requireBusiness();

  const bill = await getBillDetail(businessId, id);
  if (!bill) notFound();

  const previewData = toBillPreviewData(bill);

  const pending = bill.totalAmount - bill.paidAmount;

  return (
    <div>
      <PageHeader
        title={bill.billNumber}
        backHref="/bills"
        action={
          <div className="flex shrink-0 gap-2">
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
