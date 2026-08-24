import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A section header with a small colored icon badge, used consistently
 * across every dashboard card so the page reads as one coherent system
 * instead of plain text headings. */
export function SectionTitle({
  icon: Icon,
  children,
  tone = "default",
}: {
  icon: LucideIcon;
  children: ReactNode;
  tone?: "default" | "success" | "info" | "premium";
}) {
  const toneClass = {
    default: "bg-primary/12 text-primary",
    success: "bg-working/12 text-working",
    info: "bg-info/12 text-info",
    premium: "bg-purple/12 text-purple",
  }[tone];

  return (
    <CardTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", toneClass)}>
        <Icon className="size-4" />
      </span>
      {children}
    </CardTitle>
  );
}
