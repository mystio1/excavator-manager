"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OPERATOR_LANGUAGES, type OperatorLang } from "@/lib/i18n/operator";
import { cn } from "@/lib/utils";

export function OperatorLanguageForm({ operatorLanguage }: { operatorLanguage: string }) {
  const { mutate } = useSWRConfig();
  const [lang, setLang] = useState<OperatorLang>((operatorLanguage as OperatorLang) || "en");
  const [success, setSuccess] = useState(false);
  const { error, pending, run } = useApiForm(async (operatorLang: OperatorLang) => {
    await apiFetch("/api/settings/operator-language", {
      method: "PATCH",
      body: JSON.stringify({ operatorLanguage: operatorLang }),
    });
    await mutate("/api/settings");
    setSuccess(true);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSuccess(false);
    await run(lang);
  }

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
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          {success && !error && <p className="text-sm font-medium text-working">Saved.</p>}
          <Button type="submit" size="lg" className="h-11 self-start" disabled={pending}>
            {pending ? "Saving..." : "Save Language"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
