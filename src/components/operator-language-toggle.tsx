"use client";

import { OPERATOR_LANGUAGES, type OperatorLang } from "@/lib/i18n/operator";
import { cn } from "@/lib/utils";

export function OperatorLanguageToggle({
  lang,
  onChange,
}: {
  lang: OperatorLang;
  onChange: (lang: OperatorLang) => void;
}) {
  return (
    <div className="mb-4 flex justify-center gap-1.5">
      {OPERATOR_LANGUAGES.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => onChange(l.id)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
            lang === l.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
