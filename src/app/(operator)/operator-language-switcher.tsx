"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { apiFetch } from "@/lib/api-client";
import { OPERATOR_LANGUAGES, type OperatorLang } from "@/lib/i18n/operator";
import { cn } from "@/lib/utils";

/** The operator's own language choice, tappable right on their home page —
 * separate from (and overriding) the admin's business-wide default in
 * Settings. Tapping a language applies it immediately with no separate
 * "Save" step. */
export function OperatorLanguageSwitcher({ lang }: { lang: OperatorLang }) {
  const { mutate } = useSWRConfig();
  const [pending, setPending] = useState(false);

  async function choose(operatorLanguage: OperatorLang) {
    if (operatorLanguage === lang) return;
    setPending(true);
    try {
      await apiFetch("/api/operator/language", { method: "POST", body: JSON.stringify({ operatorLanguage }) });
      await mutate("/api/operator/home");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("mb-1 flex justify-center gap-1.5", pending && "opacity-60")}>
      {OPERATOR_LANGUAGES.map((l) => (
        <button
          key={l.id}
          type="button"
          disabled={pending}
          onClick={() => choose(l.id)}
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
