import { registerPlugin } from "@capacitor/core";

/**
 * Bridge to the custom Android-only native plugin (see
 * android/app/src/main/java/.../FileSaverPlugin.java) that saves a file
 * already fetched in JS and opens it via Android's viewer/share sheet.
 * There is no iOS/web implementation — every call site must be guarded
 * with `Capacitor.isNativePlatform()`.
 */
export interface FileSaverPlugin {
  /** `data` is base64-encoded file content. Writes it to app storage, then
   * launches Android's viewer/share chooser for it via a FileProvider URI. */
  saveAndOpenFile(options: { data: string; filename: string; mimeType: string }): Promise<{ path: string }>;
}

export const FileSaver = registerPlugin<FileSaverPlugin>("FileSaver");
