"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OperatorLanguageToggle } from "@/components/operator-language-toggle";
import { OPERATOR_LANG_STORAGE_KEY, ot, otMsg, type OperatorLang } from "@/lib/i18n/operator";

type SignupResult = { ok: true } | { success: true; message: string };

export default function OperatorSignupPage() {
  const router = useRouter();
  const [result, setResult] = useState<SignupResult | null>(null);
  const { error, pending: isPending, run } = useApiForm(async (body: Record<string, unknown>) => {
    const res = await apiFetch<SignupResult>("/api/auth/operator-signup", { method: "POST", body: JSON.stringify(body) });
    if ("success" in res) {
      setResult(res);
    } else {
      router.push("/operator");
    }
  });
  const [lang, setLang] = useState<OperatorLang>("en");

  useEffect(() => {
    const stored = localStorage.getItem(OPERATOR_LANG_STORAGE_KEY) as OperatorLang | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a browser-only API unavailable during SSR
    if (stored) setLang(stored);
  }, []);

  function chooseLang(next: OperatorLang) {
    setLang(next);
    localStorage.setItem(OPERATOR_LANG_STORAGE_KEY, next);
  }

  const t = (key: string) => ot(lang, key);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await run({
      businessCode: fd.get("businessCode"),
      name: fd.get("name"),
      mobile: fd.get("mobile"),
      pin: fd.get("pin"),
      confirmPin: fd.get("confirmPin"),
    });
  }

  if (result && "success" in result) {
    return (
      <>
        <OperatorLanguageToggle lang={lang} onChange={chooseLang} />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="size-10 text-working" />
            <p className="text-lg font-bold">{t("signup.requestSent")}</p>
            <p className="text-sm text-muted-foreground">{otMsg(lang, result.message)}</p>
            <Button size="lg" className="mt-2 h-12 w-full text-base" nativeButton={false} render={<Link href="/operator-login" />}>
              {t("signup.goToLogin")}
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <OperatorLanguageToggle lang={lang} onChange={chooseLang} />
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t("signup.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">{t("signup.intro")}</p>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="businessCode" className="text-base">
                {t("signup.businessCode")}
              </Label>
              <Input
                id="businessCode"
                name="businessCode"
                placeholder={t("signup.businessCodePlaceholder")}
                required
                maxLength={20}
                className="h-12 text-center font-mono text-lg uppercase tracking-[0.3em]"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name" className="text-base">
                {t("signup.yourName")}
              </Label>
              <Input id="name" name="name" required className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mobile" className="text-base">
                {t("signup.mobile")}
              </Label>
              <Input id="mobile" name="mobile" type="tel" required className="h-12 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pin" className="text-base">
                {t("signup.choosePin")}
              </Label>
              <Input
                id="pin"
                name="pin"
                type="password"
                inputMode="numeric"
                placeholder={t("signup.pinPlaceholder")}
                required
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPin" className="text-base">
                {t("signup.confirmPin")}
              </Label>
              <Input id="confirmPin" name="confirmPin" type="password" inputMode="numeric" required className="h-12 text-base" />
            </div>
            {error && <p className="text-sm font-medium text-destructive">{otMsg(lang, error)}</p>}
            <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending}>
              {isPending ? t("signup.submitting") : t("signup.submit")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("signup.alreadyApproved")}{" "}
            <Link href="/operator-login" className="font-medium text-primary underline underline-offset-4">
              {t("signup.loginHere")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </>
  );
}
