import { registerPlugin } from "@capacitor/core";

/**
 * Bridge to the custom Android-only native plugin (see
 * android/app/src/main/java/.../PrintPlugin.java) that hands the WebView's
 * rendered content to Android's own print system, since window.print() has
 * no effect inside a WebView. No iOS/web implementation — every call site
 * must be guarded with `Capacitor.isNativePlatform()`.
 */
export interface PrintPlugin {
  printCurrentPage(): Promise<void>;
}

export const Print = registerPlugin<PrintPlugin>("Print");
