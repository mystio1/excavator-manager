"use client";

import { useActionState } from "react";
import { updateOwnOperatorLanguageAction } from "./actions";
import { OPERATOR_LANGUAGES, type OperatorLang } from "@/lib/i18n/operator";
import { cn } from "@/lib/utils";

/** The operator's own language choice, tappable right on their home page —
 * separate from (and overriding) the admin's business-wide default in
 * Settings. Each button is its own submit trigger (native name/value on the
 * activating submit button), so tapping a language applies it immediately
 * with no separate "Save" step. */
export function OperatorLanguageSwitcher({ lang }: { lang: OperatorLang }) {
  const [, formAction, isPending] = useActionState(updateOwnOperatorLanguageAction, undefined);

  return (
    <form action={formAction} className={cn("mb-1 flex justify-center gap-1.5", isPending && "opacity-60")}>
      {OPERATOR_LANGUAGES.map((l) => (
        <button
          key={l.id}
          type="submit"
          name="operatorLanguage"
          value={l.id}
          disabled={isPending}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
            lang === l.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {l.label}
        </button>
      ))}
    </form>
  );
}
