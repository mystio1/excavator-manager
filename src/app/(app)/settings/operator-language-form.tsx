"use client";

import { useActionState, useState } from "react";
import { updateOperatorLanguageAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OPERATOR_LANGUAGES, type OperatorLang } from "@/lib/i18n/operator";
import { cn } from "@/lib/utils";

export function OperatorLanguageForm({ operatorLanguage }: { operatorLanguage: string }) {
  const [state, formAction, isPending] = useActionState(updateOperatorLanguageAction, undefined);
  const [lang, setLang] = useState<OperatorLang>((operatorLanguage as OperatorLang) || "en");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Operator Language</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Controls the language operators see once logged into their portal — job dialogs, readings, everything.
          Takes effect immediately for everyone.
        </p>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-1">
            {OPERATOR_LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                className={cn(
                  "rounded-md py-2 text-sm font-semibold transition-colors",
                  lang === l.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="operatorLanguage" value={lang} />
          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
          {state?.success && <p className="text-sm font-medium text-working">Saved.</p>}
          <Button type="submit" size="lg" className="h-11 self-start" disabled={isPending}>
            {isPending ? "Saving..." : "Save Language"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
