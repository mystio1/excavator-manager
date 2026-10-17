"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileSaver } from "@/lib/native/file-saver";
import { billNodeToPdfBlob, billPdfFilename, blobToBase64, waNumber } from "@/lib/bill-pdf";
import { formatCurrency } from "@/lib/utils/currency";

const PDF_MIME = "application/pdf";

/** The id the bill detail page puts on the rendered BillPreview. */
export const BILL_PDF_AREA_ID = "bill-pdf-area";

function message(billNumber: string, businessName: string, total: number, pending: number): string {
  const lines = [
    `${businessName}`,
    `Bill ${billNumber}`,
    `Total: ${formatCurrency(total)}`,
  ];
  if (pending > 0) lines.push(`Balance due: ${formatCurrency(pending)}`);
  else lines.push("Paid in full — thank you.");
  return lines.join("\n");
}

/** Builds a PDF of the bill as it is rendered on screen and hands it to
 * WhatsApp. Three routes, because none of them works everywhere:
 *  - Android app: the FileSaver plugin's ACTION_SEND sheet (WhatsApp included).
 *  - Phone browsers: navigator.share with the file attached.
 *  - Desktop: no browser can attach a file to WhatsApp, so the PDF downloads
 *    and WhatsApp Web opens with the text ready — the owner attaches the file
 *    that just landed in Downloads. */
export function ShareBillButton({
  billNumber,
  businessName,
  customerMobile,
  total,
  pending,
}: {
  billNumber: string;
  businessName: string;
  customerMobile: string | null;
  total: number;
  pending: number;
}) {
  const [busy, setBusy] = useState(false);

  async function onShare() {
    const node = document.getElementById(BILL_PDF_AREA_ID);
    if (!node) {
      window.alert("Could not find the bill to share");
      return;
    }
    setBusy(true);
    try {
      const blob = await billNodeToPdfBlob(node);
      const filename = billPdfFilename(billNumber);
      const text = message(billNumber, businessName, total, pending);

      if (Capacitor.isNativePlatform()) {
        await FileSaver.shareFile({ data: await blobToBase64(blob), filename, mimeType: PDF_MIME, text });
        return;
      }

      const file = new File([blob], filename, { type: PDF_MIME });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Bill ${billNumber}`, text });
          return;
        } catch (err) {
          // Dismissing the share sheet is not a failure worth reporting.
          if (err instanceof DOMException && err.name === "AbortError") return;
          throw err;
        }
      }

      // Desktop: download the PDF, then open WhatsApp with the message ready.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      const to = waNumber(customerMobile);
      window.open(
        `https://wa.me/${to}?text=${encodeURIComponent(`${text}\n\n(${filename} attached)`)}`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not prepare the bill for sharing");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="lg"
      variant="outline"
      className="h-11 px-2.5 print-hidden sm:px-3"
      onClick={onShare}
      disabled={busy}
    >
      <Share2 className="size-5" />
      <span className="hidden sm:inline">{busy ? "Preparing..." : "Share on WhatsApp"}</span>
      <span className="sm:hidden">{busy ? "..." : "Share"}</span>
    </Button>
  );
}
