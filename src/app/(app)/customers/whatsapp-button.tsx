"use client";

import { Capacitor } from "@capacitor/core";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WhatsAppButton({ mobile, name, pending }: { mobile: string; name: string; pending: number }) {
  const digits = mobile.replace(/\D/g, "");
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const message =
    pending > 0.01
      ? `Hi ${name}, this is a reminder that you have a pending payment of ₹${pending.toLocaleString("en-IN")}. Thank you!`
      : `Hi ${name}!`;
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  function openWhatsApp(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (Capacitor.isNativePlatform()) {
      // window.open()/target=_blank both route through the WebView's "new
      // window" handling, which Capacitor's Android WebView never
      // implements — the call just silently does nothing there. A
      // same-window navigation instead goes through
      // shouldOverrideUrlLoading, which Capacitor already hands off to
      // Android's own Intent resolution (opens the WhatsApp app directly if
      // installed) before the WebView itself ever actually loads the URL,
      // so the app stays exactly where it was underneath.
      window.location.href = waUrl;
    } else {
      // Mobile/desktop browsers do implement window.open's new-window path
      // (and resolve wa.me to the WhatsApp app via normal App Link
      // handling there), so this already works correctly everywhere
      // outside the bundled Android build.
      window.open(waUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className="text-working hover:text-working"
      aria-label="Message on WhatsApp"
      onClick={openWhatsApp}
    >
      <MessageCircle className="size-4" />
    </Button>
  );
}
