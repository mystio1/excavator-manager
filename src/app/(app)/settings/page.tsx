import { requireBusiness } from "@/lib/session";
import { getBusinessSettings, listBankAccounts } from "@/lib/services/settings";
import { PageHeader } from "@/components/page-header";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { BusinessProfileForm } from "./business-profile-form";
import { BillLetterheadForm } from "./bill-letterhead-form";
import { BankAccountsSection } from "./bank-accounts-section";
import { BusinessCodeCard } from "./business-code-card";
import { OperatorLanguageForm } from "./operator-language-form";

export default async function SettingsPage() {
  const { businessId } = await requireBusiness();
  const [business, bankAccounts] = await Promise.all([
    getBusinessSettings(businessId),
    listBankAccounts(businessId),
  ]);

  return (
    <div>
      <PageHeader title="Settings" backHref="/dashboard" />
      <div className="flex flex-col gap-4 px-4 pb-6 md:px-8">
        <ThemeSwitcher />
        <BusinessCodeCard code={business.code} />
        <OperatorLanguageForm operatorLanguage={business.operatorLanguage} />
        <BusinessProfileForm business={business} />
        <BillLetterheadForm business={business} />
        <BankAccountsSection accounts={bankAccounts} />
      </div>
    </div>
  );
}
