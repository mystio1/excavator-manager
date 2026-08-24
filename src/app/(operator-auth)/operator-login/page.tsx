"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { operatorLoginAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OperatorLanguageToggle } from "@/components/operator-language-toggle";
import { OPERATOR_LANG_STORAGE_KEY, ot, otMsg, type OperatorLang } from "@/lib/i18n/operator";

const REMEMBERED_MOBILE_KEY = "operator-remembered-mobile";

export default function OperatorLoginPage() {
  const [state, formAction, isPending] = useActionState(operatorLoginAction, undefined);
  const [lang, setLang] = useState<OperatorLang>("en");
  const [rememberedMobile, setRememberedMobile] = useState<string | null>(null);

  useEffect(() => {
    const storedLang = localStorage.getItem(OPERATOR_LANG_STORAGE_KEY) as OperatorLang | null;
    const storedMobile = localStorage.getItem(REMEMBERED_MOBILE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a browser-only API unavailable during SSR
    if (storedLang) setLang(storedLang);
    if (storedMobile) setRememberedMobile(storedMobile);
  }, []);

  function chooseLang(next: OperatorLang) {
    setLang(next);
    localStorage.setItem(OPERATOR_LANG_STORAGE_KEY, next);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const mobile = rememberedMobile ?? (new FormData(e.currentTarget).get("mobile") as string) ?? "";
    if (mobile) localStorage.setItem(REMEMBERED_MOBILE_KEY, mobile);
  }

  function useDifferentNumber() {
    localStorage.removeItem(REMEMBERED_MOBILE_KEY);
    setRememberedMobile(null);
  }

  const t = (key: string, vars?: Record<string, string>) => ot(lang, key, vars);

  return (
    <>
      <OperatorLanguageToggle lang={lang} onChange={chooseLang} />
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t("login.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4">
            {rememberedMobile ? (
              <div className="flex flex-col gap-1.5">
                <input type="hidden" name="mobile" value={rememberedMobile} />
                <p className="text-sm text-muted-foreground">{t("login.quickLoginAs", { mobile: rememberedMobile })}</p>
                <button
                  type="button"
                  onClick={useDifferentNumber}
                  className="self-start text-sm font-semibold text-primary"
                >
                  {t("login.notYou")}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="mobile" className="text-base">
                  {t("login.mobile")}
                </Label>
                <Input id="mobile" name="mobile" type="tel" required className="h-12 text-base" autoFocus />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="pin" className="text-base">
                {t("login.pin")}
              </Label>
              <Input
                id="pin"
                name="pin"
                type="password"
                inputMode="numeric"
                required
                className="h-12 text-base"
                autoFocus={!!rememberedMobile}
              />
            </div>
            {state?.error && <p className="text-sm font-medium text-destructive">{otMsg(lang, state.error)}</p>}
            <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending}>
              {isPending ? t("login.submitting") : t("login.submit")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("login.firstTime")}{" "}
            <Link href="/operator-signup" className="font-medium text-primary underline underline-offset-4">
              {t("login.setupAccount")}
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            {t("login.owner")}{" "}
            <Link href="/login" className="font-medium text-primary underline underline-offset-4">
              {t("login.loginHere")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </>
  );
}
