"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button size="lg" className="h-11 px-2.5 print-hidden sm:px-3" onClick={() => window.print()}>
      <Printer className="size-5" />
      <span className="hidden sm:inline">Print / PDF</span>
      <span className="sm:hidden">Print</span>
    </Button>
  );
}
