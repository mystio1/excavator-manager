"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { useClearClientCache } from "@/lib/use-clear-client-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OperatorLanguageToggle } from "@/components/operator-language-toggle";
import { useDocumentLang, usePageTitle } from "@/components/page-title";
import { OPERATOR_LANG_STORAGE_KEY, ot, otMsg, type OperatorLang } from "@/lib/i18n/operator";

// `verificationCode` is absent only from an older server (which also did not
// need one); `message` already carries the code for apps that ignore the field.
type SignupResult = { ok: true } | { success: true; message: string; verificationCode?: string };

// Page-local copy for the verification-code panel (the shared operator i18n
// dictionary has no keys for it yet); English fallback like ot() does.
const CODE_TEXT: Record<OperatorLang, { label: string; hint: string }> = {
  en: {
    label: "Your verification code",
    hint: "Give this code to your admin — they need it to approve you. Write it down: it is shown only once.",
  },
  hi: {
    label: "आपका सत्यापन कोड",
    hint: "यह कोड अपने एडमिन को दें — मंज़ूरी के लिए उन्हें इसकी ज़रूरत है। इसे लिख लें, यह दोबारा नहीं दिखाया जाएगा।",
  },
  mr: {
    label: "तुमचा पडताळणी कोड",
    hint: "हा कोड तुमच्या ऍडमिनला द्या — मंजुरीसाठी त्यांना तो लागेल. तो लिहून ठेवा, पुन्हा दाखवला जाणार नाही.",
  },
};

export default function OperatorSignupPage() {
  const router = useRouter();
  const clearClientCache = useClearClientCache();
  const [result, setResult] = useState<SignupResult | null>(null);
  const { error, pending: isPending, run } = useApiForm(async (body: Record<string, unknown>) => {
    const res = await apiFetch<SignupResult>("/api/auth/operator-signup", { method: "POST", body: JSON.stringify(body) });
    if ("success" in res) {
      setResult(res);
    } else {
      await clearClientCache(); // never show a previous account's cached data
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
  useDocumentLang(lang);
  usePageTitle(t("signup.title"));
  const codeText = CODE_TEXT[lang] ?? CODE_TEXT.en;

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
            <p role="heading" aria-level={1} className="text-lg font-bold">
              {t("signup.requestSent")}
            </p>
            {result.verificationCode ? (
              <div className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-4">
                <p className="text-sm font-semibold text-muted-foreground">{codeText.label}</p>
                <p
                  className="font-mono text-4xl font-bold tracking-[0.35em] text-primary-text select-all"
                  aria-label={result.verificationCode.split("").join(" ")}
                >
                  {result.verificationCode}
                </p>
                <p className="text-sm text-muted-foreground">{codeText.hint}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{otMsg(lang, result.message)}</p>
            )}
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
          <CardTitle role="heading" aria-level={1} className="text-2xl">
            {t("signup.title")}
          </CardTitle>
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
                maxLength={8}
                autoComplete="new-password"
                className="h-12 text-base"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPin" className="text-base">
                {t("signup.confirmPin")}
              </Label>
              <Input
                id="confirmPin"
                name="confirmPin"
                type="password"
                inputMode="numeric"
                required
                maxLength={8}
                autoComplete="new-password"
                className="h-12 text-base"
              />
            </div>
            {error && <p role="alert" className="text-sm font-medium text-destructive">{otMsg(lang, error)}</p>}
            <Button type="submit" size="lg" className="h-12 text-base" disabled={isPending}>
              {isPending ? t("signup.submitting") : t("signup.submit")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("signup.alreadyApproved")}{" "}
            <Link href="/operator-login" className="font-medium text-primary-text underline underline-offset-4">
              {t("signup.loginHere")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </>
  );
}
