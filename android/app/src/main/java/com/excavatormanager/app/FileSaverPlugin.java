package com.excavatormanager.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Saves a file the JS side already fetched (as base64 — the fetch itself
 * carries the session cookie, so it happens in JS via apiFetch, not here)
 * and hands it to Android's own viewer/share sheet via a FileProvider
 * content:// URI. Used for the bill Excel export: the WebView's plain
 * `<a download>` link (see download-excel-button.tsx) only works for
 * same-origin resources, and the export API lives on a different origin
 * from the bundled app, so Android's WebView never triggers a real
 * download for it — this plugin is the replacement for that path only;
 * the web build keeps using the plain link, which works fine there.
 */
@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    private static final String DOWNLOADS_SUBDIR = "downloads";

    @PluginMethod
    public void saveAndOpenFile(PluginCall call) {
        String base64Data = call.getString("data");
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType");
        if (base64Data == null || filename == null || mimeType == null) {
            call.reject("Missing required parameter", "invalid_argument");
            return;
        }

        File downloadsDir = new File(getContext().getExternalFilesDir(null), DOWNLOADS_SUBDIR);
        if (!downloadsDir.exists() && !downloadsDir.mkdirs()) {
            call.reject("Could not create downloads directory", "storage_error");
            return;
        }
        File outFile = new File(downloadsDir, filename);

        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            try (FileOutputStream out = new FileOutputStream(outFile)) {
                out.write(bytes);
            }
        } catch (IOException | IllegalArgumentException e) {
            call.reject("Could not save file: " + e.getMessage(), "write_failed", e);
            return;
        }

        try {
            Uri contentUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    outFile
            );

            Intent viewIntent = new Intent(Intent.ACTION_VIEW);
            viewIntent.setDataAndType(contentUri, mimeType);
            viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

            Intent chooser = Intent.createChooser(viewIntent, "Open " + filename);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("path", outFile.getAbsolutePath());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("File saved but could not be opened: " + e.getMessage(), "open_failed", e);
        }
    }
}
