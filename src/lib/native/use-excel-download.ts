"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { apiUrl } from "@/lib/api-client";
import { FileSaver } from "@/lib/native/file-saver";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

/** Shared by every "download an .xlsx from an API route" button. Web just
 * needs a plain `<a href download>` since the resource is same-origin, but
 * on the Android bundled build the export API is cross-origin (the app is
 * fully local, the API is the live server) and Android's WebView has no
 * download handler for that (see FileSaverPlugin.java) — a plain link click
 * would silently do nothing there, so the native path fetches the bytes
 * itself and hands them to a native plugin instead. */
export function useExcelDownload(path: string, fallbackFilename: string) {
  const [pending, setPending] = useState(false);
  const href = apiUrl(path);
  const isNative = Capacitor.isNativePlatform();

  async function downloadNative(e: React.MouseEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch(href, { credentials: "include" });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const data = await blobToBase64(blob);
      const filename = filenameFromResponse(res, fallbackFilename);
      await FileSaver.saveAndOpenFile({ data, filename, mimeType: XLSX_MIME });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not download the file");
    } finally {
      setPending(false);
    }
  }

  return { href, isNative, pending, downloadNative };
}
