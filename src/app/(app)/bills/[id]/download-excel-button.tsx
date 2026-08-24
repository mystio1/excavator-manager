import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DownloadExcelButton({ billId }: { billId: string }) {
  return (
    <Button
      render={<a href={`/bills/${billId}/export`} download />}
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
