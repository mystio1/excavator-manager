"use client";

import { Capacitor } from "@capacitor/core";
import { Printer } from "lucide-react";
import { Print } from "@/lib/native/print";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  function handlePrint() {
    if (Capacitor.isNativePlatform()) {
      Print.printCurrentPage().catch(() => window.alert("Could not open the print dialog"));
      return;
    }
    window.print();
  }

  return (
    <Button size="lg" className="h-11 px-2.5 print-hidden sm:px-3" onClick={handlePrint}>
      <Printer className="size-5" />
      <span className="hidden sm:inline">Print / PDF</span>
      <span className="sm:hidden">Print</span>
    </Button>
  );
}
