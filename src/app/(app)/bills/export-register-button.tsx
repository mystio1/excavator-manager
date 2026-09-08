"use client";

import { FileSpreadsheet } from "lucide-react";
import { useExcelDownload } from "@/lib/native/use-excel-download";
import { Button } from "@/components/ui/button";

/** Exports whatever set of bills is currently in view (respects the same
 * customerId/filter query params the list itself is reading) as a single
 * .xlsx register from the bulk /api/bills/export route. */
export function ExportRegisterButton({ query }: { query: string }) {
  const { href, isNative, pending, downloadNative } = useExcelDownload(`/api/bills/export${query}`, "bills-register.xlsx");

  if (isNative) {
    return (
      <Button type="button" onClick={downloadNative} disabled={pending} size="lg" variant="secondary" className="h-11 px-2.5 sm:px-3">
        <FileSpreadsheet className="size-5" />
        <span className="hidden sm:inline">Export to Excel</span>
        <span className="sm:hidden">Excel</span>
      </Button>
    );
  }

  return (
    <Button render={<a href={href} download />} nativeButton={false} size="lg" variant="secondary" className="h-11 px-2.5 sm:px-3">
      <FileSpreadsheet className="size-5" />
      <span className="hidden sm:inline">Export to Excel</span>
      <span className="sm:hidden">Excel</span>
    </Button>
  );
}
