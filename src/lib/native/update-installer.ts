import { registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

export type DownloadProgress = {
  bytesWritten: number;
  totalBytes: number;
  /** -1 when the server didn't report a Content-Length (progress is indeterminate). */
  percent: number;
};

/**
 * Bridge to the custom Android-only native plugin (see
 * android/app/src/main/java/.../UpdateInstallerPlugin.java) that downloads a
 * release APK and hands it to Android's real system installer. There is no
 * iOS/web implementation — every call site must be guarded with
 * `Capacitor.isNativePlatform()` (this same web app also runs in ordinary
 * browsers and via the Cloudflare tunnel).
 */
export interface UpdateInstallerPlugin {
  /** Streams the APK to app-private storage, verifying its SHA-256 if `expectedSha256` is given. */
  downloadApk(options: { url: string; expectedSha256?: string }): Promise<{ path: string }>;
  /** Launches Android's own package-installer confirmation screen for a downloaded APK. */
  installApk(options: { path: string }): Promise<{ started: boolean }>;
  /** Whether this app currently has the "install unknown apps" permission (always true below Android 8). */
  canRequestPackageInstalls(): Promise<{ allowed: boolean }>;
  /** Deep-links to the system settings screen where the user can grant that permission. */
  openInstallPermissionSettings(): Promise<void>;
  addListener(
    eventName: "downloadProgress",
    listenerFunc: (data: DownloadProgress) => void,
  ): Promise<PluginListenerHandle>;
}

export const UpdateInstaller = registerPlugin<UpdateInstallerPlugin>("UpdateInstaller");
