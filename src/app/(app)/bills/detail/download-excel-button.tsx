"use client";

import { FileSpreadsheet } from "lucide-react";
import { useExcelDownload } from "@/lib/native/use-excel-download";
import { Button } from "@/components/ui/button";

export function DownloadExcelButton({ billId }: { billId: string }) {
  const { href, isNative, pending, downloadNative } = useExcelDownload(`/api/bills/${billId}/export`, `bill-${billId}.xlsx`);

  if (isNative) {
    return (
      <Button
        type="button"
        onClick={downloadNative}
        disabled={pending}
        size="lg"
        variant="secondary"
        className="h-11 px-2.5 print-hidden sm:px-3"
      >
        <FileSpreadsheet className="size-5" />
        Excel
      </Button>
    );
  }

  return (
    <Button
      render={<a href={href} download />}
      nativeButton={false}
      size="lg"
      variant="secondary"
      className="h-11 px-2.5 print-hidden sm:px-3"
    >
      <FileSpreadsheet className="size-5" />
      Excel
    </Button>
  );
}
