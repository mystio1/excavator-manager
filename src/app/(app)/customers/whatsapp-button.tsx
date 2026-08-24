"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WhatsAppButton({ mobile, name, pending }: { mobile: string; name: string; pending: number }) {
  const digits = mobile.replace(/\D/g, "");
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const message =
    pending > 0.01
      ? `Hi ${name}, this is a reminder that you have a pending payment of ₹${pending.toLocaleString("en-IN")}. Thank you!`
      : `Hi ${name}!`;

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className="text-working hover:text-working"
      aria-label="Message on WhatsApp"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      }}
    >
      <MessageCircle className="size-4" />
    </Button>
  );
}
