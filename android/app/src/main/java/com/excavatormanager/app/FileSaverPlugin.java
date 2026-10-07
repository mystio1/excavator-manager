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
    /** Exported bills contain customer data: do not leave them on the device indefinitely. */
    private static final long MAX_FILE_AGE_MS = 7L * 24 * 60 * 60 * 1000;
    private static final int MAX_FILENAME_LENGTH = 80;

    /**
     * The filename comes from JavaScript, so treat it as untrusted: keep only the last path segment, replace
     * anything but letters/digits/dot/dash/underscore/space, never start with a dot, and bound the length.
     * (Path separators or ".." in a name must not be able to write outside the downloads directory.)
     */
    static String sanitizeFilename(String name) {
        String base = name.replace('\\', '/');
        int slash = base.lastIndexOf('/');
        if (slash >= 0) base = base.substring(slash + 1);
        base = base.replaceAll("[^A-Za-z0-9._ -]", "_");
        while (base.startsWith(".")) base = "_" + base.substring(1);
        if (base.length() > MAX_FILENAME_LENGTH) base = base.substring(base.length() - MAX_FILENAME_LENGTH);
        if (base.trim().isEmpty()) base = "download.xlsx";
        return base;
    }

    /** Deletes exports older than a week so customer data does not accumulate in app storage. */
    private static void pruneOldFiles(File dir) {
        File[] files = dir.listFiles();
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - MAX_FILE_AGE_MS;
        for (File f : files) {
            if (f.isFile() && f.lastModified() < cutoff) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
    }

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
        pruneOldFiles(downloadsDir);
        String safeName = sanitizeFilename(filename);
        File outFile = new File(downloadsDir, safeName);
        try {
            // Belt and braces: whatever the name was, the file must resolve INSIDE the downloads directory.
            if (!outFile.getCanonicalPath().startsWith(downloadsDir.getCanonicalPath() + File.separator)) {
                call.reject("Invalid file name", "invalid_argument");
                return;
            }
        } catch (IOException e) {
            call.reject("Invalid file name", "invalid_argument", e);
            return;
        }

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

            Intent chooser = Intent.createChooser(viewIntent, "Open " + safeName);
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
