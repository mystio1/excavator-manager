"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Canonical values are always stored/submitted in English regardless of the
// displayed label's language, so downstream string-matching (e.g. Site
// Analysis's bucket/breaker hour split) keeps working no matter which
// operator language is active.
export const ATTACHMENT_VALUES = ["Bucket", "Breaker", "Chaining"] as const;

export function AttachmentPicker({
  name,
  defaultValue,
  label,
  optionLabels,
}: {
  name: string;
  defaultValue?: string | null;
  label: string;
  /** Displayed label per canonical value — defaults to the English value itself. */
  optionLabels?: Partial<Record<(typeof ATTACHMENT_VALUES)[number], string>>;
}) {
  const [value, setValue] = useState(defaultValue ?? "");

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-base">{label}</Label>
      <input type="hidden" name={name} value={value} />
      <div className="grid grid-cols-3 gap-2">
        {ATTACHMENT_VALUES.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setValue((prev) => (prev === opt ? "" : opt))}
            className={cn(
              "h-11 rounded-lg border text-sm font-semibold transition-colors",
              value === opt
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-muted text-muted-foreground",
            )}
          >
            {optionLabels?.[opt] ?? opt}
          </button>
        ))}
      </div>
    </div>
  );
}
