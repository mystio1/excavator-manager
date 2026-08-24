"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FileSpreadsheet } from "lucide-react";
import { apiUrl } from "@/lib/api-client";
import { FileSaver } from "@/lib/native/file-saver";
import { Button } from "@/components/ui/button";

/** Extracts the filename the export route set via Content-Disposition
 * (see bills/[id]/export/route.ts) instead of guessing one client-side. */
function filenameFromResponse(res: Response, fallback: string): string {
  const match = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function DownloadExcelButton({ billId }: { billId: string }) {
  const [pending, setPending] = useState(false);
  const href = apiUrl(`/bills/${billId}/export`);

  // Plain `<a download>` only works for same-origin resources — on the
  // Android bundled build the export API is cross-origin (the app is fully
  // local, the API is the live server), and Android's WebView has no
  // download handler registered for that (see FileSaverPlugin.java), so the
  // click would silently do nothing. Fetching it ourselves and handing the
  // bytes to a native plugin sidesteps that; the web build keeps the plain
  // link, which already works there.
  async function downloadNative(e: React.MouseEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch(href, { credentials: "include" });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const data = await blobToBase64(blob);
      const filename = filenameFromResponse(res, `bill-${billId}.xlsx`);
      await FileSaver.saveAndOpenFile({
        data,
        filename,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not download the file");
    } finally {
      setPending(false);
    }
  }

  if (Capacitor.isNativePlatform()) {
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
