package com.excavatormanager.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * `window.print()` has no default handler in an Android WebView (unlike a
 * real browser, which opens its own print UI) — it silently does nothing.
 * This hands the WebView's current rendered content to Android's own
 * PrintManager via WebView.createPrintDocumentAdapter(), the standard API
 * for printing WebView content since API 19 — the same system print sheet
 * a real browser would show, letting the user pick a printer or "Save as
 * PDF", which is what the "Print / PDF" button is meant to offer.
 */
@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {

    @PluginMethod
    public void printCurrentPage(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
            String jobName = getContext().getString(R.string.app_name) + " Bill";
            printManager.print(
                jobName,
                webView.createPrintDocumentAdapter(jobName),
                new PrintAttributes.Builder().build()
            );
            call.resolve();
        });
    }
}
