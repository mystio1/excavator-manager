"use client";

import useSWR from "swr";
import type { getBusinessSettings, listBankAccounts } from "@/lib/services/settings";
import type { Plain } from "@/lib/plain";
import { swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { AppVersionFooter } from "@/components/app-version-footer";
import { BusinessProfileForm } from "./business-profile-form";
import { BillLetterheadForm } from "./bill-letterhead-form";
import { BankAccountsSection } from "./bank-accounts-section";
import { BusinessCodeCard } from "./business-code-card";
import { OperatorLanguageForm } from "./operator-language-form";
import { AppLockSection } from "./app-lock-section";
import { ChangePasswordCard } from "./change-password-card";
import { SignOutEverywhereCard } from "./sign-out-everywhere-card";
import Loading from "../loading";

type SettingsData = {
  business: Plain<Awaited<ReturnType<typeof getBusinessSettings>>>;
  bankAccounts: Plain<Awaited<ReturnType<typeof listBankAccounts>>>;
  hasPin: boolean;
};

export default function SettingsPage() {
  const { data } = useSWR<SettingsData>("/api/settings", swrFetcher);

  if (!data) return <Loading />;
  const { business, bankAccounts, hasPin } = data;

  return (
    <div>
      <PageHeader title="Settings" backHref="/dashboard" />
      <div className="flex flex-col gap-4 px-4 pb-6 md:px-8">
        <ThemeSwitcher />
        <BusinessCodeCard code={business.code} />
        <AppLockSection hasPin={hasPin} />
        <ChangePasswordCard />
        <SignOutEverywhereCard />
        <OperatorLanguageForm operatorLanguage={business.operatorLanguage} />
        <BusinessProfileForm business={business} />
        <BillLetterheadForm business={business} />
        <BankAccountsSection accounts={bankAccounts} />
        <AppVersionFooter />
      </div>
    </div>
  );
}
